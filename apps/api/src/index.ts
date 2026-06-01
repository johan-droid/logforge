import "./env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import authRoutes from "./routes/auth.js";
import credentialRoutes from "./routes/credentials.js";
import dataRoutes from "./routes/data.js";
import providerRoutes from "./routes/providers.js";
import { sseManager } from "./sse/SSEManager.js";
import { SocketLogManager } from "./socket/SocketLogManager.js";
import { startLogCleanupJob } from "./polling/LogCleanupJob.js";
import { serviceSyncCoordinator } from "./polling/ServiceSync.js";
import { requireSession } from "./auth/session.js";
import { assertEncryptionConfig } from "./crypto/index.js";
import { initializeDatabase } from "./db/index.js";
import { normalizeProvider } from "./providers/registry.js";
import { Server } from "socket.io";

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

fastify.get("/api/health", async () => ({
  ok: true,
  service: "logforge-api",
}));

const socketIo = new Server(fastify.server, {
  cors: {
    origin: process.env.WEB_BASE_URL || "http://localhost:3000",
    credentials: true,
  },
});

new SocketLogManager(socketIo, fastify);

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
    initializeDatabase();
    startLogCleanupJob();
    await serviceSyncCoordinator.bootstrap();
    await fastify.listen({
      port: process.env.API_PORT ? parseInt(process.env.API_PORT) : (process.env.PORT ? parseInt(process.env.PORT) : 3001),
      host: "0.0.0.0",
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
