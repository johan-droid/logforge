import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import authRoutes from "./routes/auth.js";
import credentialRoutes from "./routes/credentials.js";
import dataRoutes from "./routes/data.js";
import providerRoutes from "./routes/providers.js";
import { sseManager } from "./sse/SSEManager.js";
import { startLogCleanupJob } from "./polling/LogCleanupJob.js";
import { serviceSyncCoordinator } from "./polling/ServiceSync.js";
import { requireSession } from "./auth/session.js";
import { assertEncryptionConfig } from "./crypto/index.js";
import { normalizeProvider } from "./providers/registry.js";

function loadEnvFile(filename: string) {
  const envPath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const value = line.slice(separatorIndex + 1).trim();
    process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const fastify = Fastify({ logger: true });

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

fastify.register(cors, {
  origin: process.env.WEB_BASE_URL || "http://localhost:3000",
  credentials: true,
});

fastify.register(jwt, {
  secret: requiredEnv("JWT_SECRET"),
});

fastify.register(authRoutes, { prefix: "/api/auth" });
fastify.register(credentialRoutes, { prefix: "/api/credentials" });
fastify.register(dataRoutes, { prefix: "/api" });
fastify.register(providerRoutes, { prefix: "/api/providers" });

fastify.get("/api/stream/:provider/:serviceId", async (request, reply) => {
  const { provider, serviceId } = request.params as {
    provider: string;
    serviceId: string;
  };
  const normalizedProvider = normalizeProvider(provider);
  if (!normalizedProvider) {
    reply.status(400).send({ error: "Unsupported provider" });
    return;
  }

  const user = await requireSession(fastify, request).catch(() => undefined);
  if (!user) {
    reply.status(401).send({ error: "Unauthorized" });
    return;
  }

  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("X-Accel-Buffering", "no");
  reply.raw.flushHeaders();

  sseManager.addClient(user.id, normalizedProvider, serviceId, reply);

  // Keep the connection open
  return new Promise(() => {});
});

const start = async () => {
  try {
    assertEncryptionConfig();
    startLogCleanupJob();
    await serviceSyncCoordinator.bootstrap();
    await fastify.listen({
      port: process.env.PORT ? parseInt(process.env.PORT) : 3001,
      host: "0.0.0.0",
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
