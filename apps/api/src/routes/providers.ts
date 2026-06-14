import { and, eq } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { requireSession } from "../auth/session.js";
import { decrypt } from "../crypto/index.js";
import { db } from "../db/index.js";
import { credentials } from "../db/schema.js";
import { normalizeProvider, providerRegistry } from "../providers/registry.js";
import { listProviderApps } from "../providers/providerApps.js";

export default async function providerRoutes(fastify: FastifyInstance) {
  fastify.get("/", async (request, reply) => {
    try {
      const user = await requireSession(fastify, request);
      const connected = await db
        .select({ provider: credentials.provider })
        .from(credentials)
        .where(eq(credentials.userId, user.id));
      const connectedProviders = new Set(connected.map((row) => row.provider));

      return Object.values(providerRegistry).map((provider) => ({
        key: provider.key,
        label: provider.label,
        connected: connectedProviders.has(provider.key),
        appsAvailable: connectedProviders.has(provider.key),
      }));
    } catch {
      reply.status(401).send({ error: "Unauthorized" });
    }
  });

  fastify.get("/:provider/apps", async (request, reply) => {
    const { provider } = request.params as { provider: string };
    const normalized = normalizeProvider(provider);
    if (!normalized) {
      reply.status(400).send({ error: "Unsupported provider" });
      return;
    }

    const user = await requireSession(fastify, request).catch(() => undefined);
    if (!user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    const credentialRows = await db
      .select()
      .from(credentials)
      .where(
        and(
          eq(credentials.userId, user.id),
          eq(credentials.provider, normalized),
        ),
      );
    const credential = credentialRows[0];

    if (!credential) {
      return { provider: normalized, apps: [], connected: false };
    }

    const token = decrypt(
      credential.encToken,
      credential.iv,
      credential.authTag,
      credential.keyVersion,
    );
    const apps = await listProviderApps(normalized, token);

    return { provider: normalized, connected: true, apps };
  });
}
