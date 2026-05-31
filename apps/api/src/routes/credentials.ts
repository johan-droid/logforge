import { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { credentials } from "../db/schema.js";
import { encrypt } from "../crypto/index.js";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { requireSession } from "../auth/session.js";
import { ensureUserRecord } from "../auth/users.js";
import { normalizeProvider } from "../providers/registry.js";
import { validateProviderToken } from "../providers/providerApps.js";
import { serviceSyncCoordinator } from "../polling/ServiceSync.js";

type CredentialBody = {
  provider: string;
  label?: string;
  token: string;
};

type JwtUser = {
  id: string;
};

export default async function credentialRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", async (request, reply) => {
    try {
      const user = await requireSession(fastify, request);
      ensureUserRecord(user);
    } catch (err) {
      reply.status(401).send(err);
    }
  });

  fastify.get("/", async (request) => {
    const userId = ((await requireSession(fastify, request)) as JwtUser).id;
    const creds = db
      .select({
        id: credentials.id,
        provider: credentials.provider,
        label: credentials.label,
        createdAt: credentials.createdAt,
      })
      .from(credentials)
      .where(eq(credentials.userId, userId))
      .all();
    return creds;
  });

  fastify.post("/", async (request, reply) => {
    const { provider, label, token } = request.body as CredentialBody;
    const userId = ((await requireSession(fastify, request)) as JwtUser).id;
    const normalizedProvider = normalizeProvider(provider);

    if (!normalizedProvider) {
      reply.status(400).send({ error: "Unsupported provider" });
      return;
    }

    if (!token?.trim()) {
      reply.status(400).send({ error: "Provider token is required" });
      return;
    }

    const isValid = await validateProviderToken(normalizedProvider, token);
    if (!isValid) {
      reply
        .status(400)
        .send({ error: "Provider token could not be validated" });
      return;
    }

    const { encToken, iv, authTag } = encrypt(token);

    const newCred = {
      id: crypto.randomUUID(),
      userId,
      provider: normalizedProvider,
      label: label || normalizedProvider,
      encToken,
      iv,
      authTag,
      createdAt: new Date(),
    };

    db.insert(credentials).values(newCred).run();
    await serviceSyncCoordinator.refreshSchedules();

    return { success: true, id: newCred.id };
  });

  fastify.delete("/:id", async (request) => {
    const { id } = request.params as { id: string };
    const userId = ((await requireSession(fastify, request)) as JwtUser).id;

    db.delete(credentials)
      .where(and(eq(credentials.id, id), eq(credentials.userId, userId)))
      .run();
    await serviceSyncCoordinator.refreshSchedules();

    return { success: true };
  });
}
