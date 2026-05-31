import { and, eq } from "drizzle-orm";
import { RATE_LIMITS } from "@repo/shared/constants";
import { FastifyInstance } from "fastify";
import { ensureUserRecord } from "../auth/users.js";
import { requireSession } from "../auth/session.js";
import { db } from "../db/index.js";
import { branches, credentials, services } from "../db/schema.js";
import { budgetManager } from "../polling/BudgetManager.js";

type ServiceWithProvider = {
  id: string;
  credentialId: string;
  providerSvcId: string;
  provider: string;
  name: string;
  type: string | null;
  repoUrl: string | null;
  active: boolean | null;
  lastSeen: Date | null;
};

async function loadUserServices(userId: string): Promise<ServiceWithProvider[]> {
  return db
    .select({
      id: services.id,
      credentialId: services.credentialId,
      providerSvcId: services.providerSvcId,
      provider: credentials.provider,
      name: services.name,
      type: services.type,
      repoUrl: services.repoUrl,
      active: services.active,
      lastSeen: services.lastSeen,
    })
    .from(services)
    .innerJoin(credentials, eq(services.credentialId, credentials.id))
    .where(eq(credentials.userId, userId))
    .all();
}

export default async function dataRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", async (request, reply) => {
    try {
      const user = await requireSession(fastify, request);
      ensureUserRecord(user);
    } catch {
      reply.status(401).send({ error: "Unauthorized" });
    }
  });

  fastify.get("/services", async (request, reply) => {
    const user = await requireSession(fastify, request).catch(() => undefined);
    if (!user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    const rows = await loadUserServices(user.id);
    return rows.map((service) => ({
      id: service.id,
      credentialId: service.credentialId,
      providerSvcId: service.providerSvcId,
      provider: service.provider,
      name: service.name,
      type: service.type,
      repoUrl: service.repoUrl,
      active: Boolean(service.active),
      lastSeen: service.lastSeen,
    }));
  });

  fastify.get("/branches/:svcId", async (request, reply) => {
    const user = await requireSession(fastify, request).catch(() => undefined);
    if (!user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    const { svcId } = request.params as { svcId: string };

    const serviceRecord = db
      .select({ id: services.id })
      .from(services)
      .innerJoin(credentials, eq(services.credentialId, credentials.id))
      .where(and(eq(services.id, svcId), eq(credentials.userId, user.id)))
      .get();

    if (!serviceRecord) {
      reply.status(404).send({ error: "Service not found" });
      return;
    }

    const branchRows = db
      .select({
        id: branches.id,
        serviceId: branches.serviceId,
        name: branches.name,
        sha: branches.sha,
        status: branches.status,
        deployUrl: branches.deployUrl,
        updatedAt: branches.updatedAt,
      })
      .from(branches)
      .where(eq(branches.serviceId, svcId))
      .all();

    return {
      serviceId: svcId,
      branches: branchRows,
    };
  });

  fastify.get("/rate-limits", async (_request, reply) => {
    const user = await requireSession(fastify, _request).catch(() => undefined);
    if (!user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    const connectedProviderRows = db
      .select({ provider: credentials.provider })
      .from(credentials)
      .where(eq(credentials.userId, user.id))
      .all();
    const connectedProviders = new Set(
      connectedProviderRows.map((row) => row.provider),
    );

    const providers = Object.keys(RATE_LIMITS);
    const budgets = await Promise.all(
      providers.map(async (provider) => {
        const budget = await budgetManager.getBudget(provider);
        return {
          provider,
          connected: connectedProviders.has(provider),
          callsUsed: budget.callsUsed,
          limitPerHr: budget.limitPerHr,
          remaining: Math.max(0, budget.limitPerHr - budget.callsUsed),
          windowStart: budget.windowStart,
        };
      }),
    );

    return budgets;
  });
}
