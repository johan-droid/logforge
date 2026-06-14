import crypto from "node:crypto";
import { FastifyInstance } from "fastify";
import { listProviderApps, validateProviderToken } from "../providers/providerApps.js";
import { normalizeProvider } from "../providers/registry.js";
import { streamPollerManager } from "../polling/StreamPollerManager.js";
import { createRedisClient, isRedisConfigured } from "../redis.js";
import { sseManager } from "../sse/SSEManager.js";

const redis = isRedisConfigured() ? createRedisClient() : null;
const valveTickets = new Map<
  string,
  { provider: string; token: string; serviceId: string }
>();

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
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: "Failed to list provider apps" });
    }
  });

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

    const isValid = await validateProviderToken(normalized, token);
    if (!isValid) {
      reply.status(400).send({ error: "Token validation failed" });
      return;
    }

    const ticketId = crypto.randomUUID();
    if (redis) {
      await redis.set(
        `valve-ticket:${ticketId}`,
        JSON.stringify({ provider: normalized, token, serviceId }),
        "EX",
        10,
      );
    } else {
      valveTickets.set(ticketId, { provider: normalized, token, serviceId });
      setTimeout(() => {
        valveTickets.delete(ticketId);
      }, 10_000);
    }

    return { ticketId };
  });

  fastify.get(
    "/stream",
    { config: { rateLimit: false } },
    async (request, reply) => {
      const { ticket, type } = request.query as { ticket?: string; type?: string };
      const logType = type === "build" ? "build" : "app";

      if (!ticket) {
        reply.status(401).send({ error: "Invalid or expired ticket" });
        return;
      }

      const rawTicket = redis
        ? await redis.getdel(`valve-ticket:${ticket}`)
        : (() => {
            const ticketData = valveTickets.get(ticket);
            valveTickets.delete(ticket);
            return ticketData ? JSON.stringify(ticketData) : null;
          })();
      if (!rawTicket) {
        reply.status(401).send({ error: "Invalid or expired ticket" });
        return;
      }

      const ticketData = JSON.parse(rawTicket) as {
        provider: string;
        token: string;
        serviceId: string;
      };
      const { provider, token, serviceId } = ticketData;

      reply.hijack();
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");
      reply.raw.flushHeaders();

      sseManager.addClient("valve-client", provider, serviceId, logType, reply);

      let polledServices: Array<{
        id: string;
        type?: "pages" | "worker";
        projectId?: string;
      }> = [];
      try {
        const apps = await listProviderApps(provider, token);
        polledServices = apps.map((app) => ({
          id: app.id,
          type: app.type,
          projectId: app.projectId,
        }));
      } catch {
        // DECISION(jules): fall back to the explicit request so the stream still opens.
      }

      if (!polledServices.some((service) => service.id === serviceId)) {
        polledServices.push({ id: serviceId, type: "pages" });
      }

      for (const service of polledServices) {
        await streamPollerManager.startPoller(provider, service.id, logType, token, {
          serviceType: service.type ?? "pages",
          providerProjectId: service.projectId ?? null,
        });
      }

      reply.raw.on("close", () => {
        for (const service of polledServices) {
          streamPollerManager.stopPoller(provider, service.id, logType, token, {
            serviceType: service.type ?? "pages",
            providerProjectId: service.projectId ?? null,
          });
        }
      });

      return;
    },
  );
}
