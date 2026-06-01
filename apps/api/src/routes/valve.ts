import crypto from "crypto";
import { FastifyInstance } from "fastify";
import { normalizeProvider } from "../providers/registry.js";
import { listProviderApps, validateProviderToken } from "../providers/providerApps.js";
import { streamPollerManager } from "../polling/StreamPollerManager.js";
import { sseManager } from "../sse/SSEManager.js";

// Ephemeral memory map for short-lived streaming tickets (expires in 10s)
const valveTickets = new Map<string, { provider: string; token: string; serviceId: string }>();

type TicketBody = {
  provider: string;
  token: string;
  serviceId: string;
};

type AppsBody = {
  provider: string;
  token: string;
};

export default async function valveRoutes(fastify: FastifyInstance) {
  // 1. Fetch apps dynamically for a provider using the raw token (stateless)
  fastify.post("/apps", async (request, reply) => {
    const { provider, token } = request.body as AppsBody;
    const normalized = normalizeProvider(provider);
    if (!normalized) {
      reply.status(400).send({ error: "Unsupported provider" });
      return;
    }

    if (!token?.trim()) {
      reply.status(400).send({ error: "Provider token is required" });
      return;
    }

    try {
      const apps = await listProviderApps(normalized, token);
      return { provider: normalized, apps };
    } catch (err) {
      fastify.log.error(err);
      reply.status(500).send({ error: "Failed to list provider apps" });
    }
  });

  // 2. Create an ephemeral, short-lived single-use streaming ticket
  fastify.post("/ticket", async (request, reply) => {
    const { provider, token, serviceId } = request.body as TicketBody;
    const normalized = normalizeProvider(provider);
    if (!normalized) {
      reply.status(400).send({ error: "Unsupported provider" });
      return;
    }

    if (!token?.trim() || !serviceId?.trim()) {
      reply.status(400).send({ error: "Token and service ID are required" });
      return;
    }

    // Validate token first
    const isValid = await validateProviderToken(normalized, token);
    if (!isValid) {
      reply.status(400).send({ error: "Token validation failed" });
      return;
    }

    const ticketId = crypto.randomUUID();
    valveTickets.set(ticketId, { provider: normalized, token, serviceId });

    // Expire ticket in 10 seconds
    setTimeout(() => {
      valveTickets.delete(ticketId);
    }, 10000);

    return { ticketId };
  });

  // 3. Ephemeral Server-Sent Events stream using the single-use ticket
  fastify.get("/stream", async (request, reply) => {
    const { ticket } = request.query as { ticket?: string };

    if (!ticket || !valveTickets.has(ticket)) {
      reply.status(401).send({ error: "Invalid or expired ticket" });
      return;
    }

    const ticketData = valveTickets.get(ticket)!;
    valveTickets.delete(ticket); // Single-use consumption

    const { provider, token, serviceId } = ticketData;

    // Set up SSE headers
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    reply.raw.flushHeaders();

    // Add to sseManager using a special valve client identifier
    sseManager.addClient("valve-client", provider, serviceId, reply);

    // Start polling in-memory for all discovered apps of this provider
    let polledServiceIds: string[] = [];
    try {
      const apps = await listProviderApps(provider, token);
      polledServiceIds = apps.map((app) => app.id);
    } catch {
      // Fallback to just the requested service
    }
    if (!polledServiceIds.includes(serviceId)) {
      polledServiceIds.push(serviceId);
    }

    for (const svcId of polledServiceIds) {
      streamPollerManager.startPoller(provider, svcId, token);
    }

    // Clean up when the client disconnects
    reply.raw.on("close", () => {
      for (const svcId of polledServiceIds) {
        streamPollerManager.stopPoller(provider, svcId, token);
      }
    });

    // Keep connection open
    return new Promise(() => {});
  });
}
