import "./env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import authRoutes from "./routes/auth.js";
import credentialRoutes from "./routes/credentials.js";
import dataRoutes from "./routes/data.js";
import providerRoutes from "./routes/providers.js";
import valveRoutes from "./routes/valve.js";
import { sseManager } from "./sse/SSEManager.js";
import { SocketLogManager } from "./socket/SocketLogManager.js";
import fastifyRateLimit from "@fastify/rate-limit";
import { startLogCleanupJob } from "./polling/LogCleanupJob.js";
import { serviceSyncCoordinator } from "./polling/ServiceSync.js";
import { requireSession } from "./auth/session.js";
import { assertEncryptionConfig, decrypt } from "./crypto/index.js";
import { db, initializeDatabase } from "./db/index.js";
import { credentials, services } from "./db/schema.js";
import { and, eq } from "drizzle-orm";
import { normalizeProvider } from "./providers/registry.js";
import { streamPollerManager } from "./polling/StreamPollerManager.js";
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

// Tight global rate limiting to prevent abuse
fastify.register(fastifyRateLimit, {
  max: 100, // 100 requests max
  timeWindow: "1 minute", // per 1 minute
  errorResponseBuilder: (request, context) => {
    return {
      statusCode: 429,
      error: "Too Many Requests",
      message: `Rate limit exceeded, retry in ${context.after} time.`,
    };
  },
});

fastify.register(jwt, {
  secret: requiredEnv("JWT_SECRET"),
});

fastify.register(authRoutes, { prefix: "/api/auth" });
fastify.register(credentialRoutes, { prefix: "/api/credentials" });
fastify.register(dataRoutes, { prefix: "/api" });
fastify.register(providerRoutes, { prefix: "/api/providers" });
fastify.register(valveRoutes, { prefix: "/api/valve" });


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

  // Load token from DB to start polling
  const credential = db
    .select()
    .from(credentials)
    .where(
      and(
        eq(credentials.userId, user.id),
        eq(credentials.provider, normalizedProvider),
      ),
    )
    .get();

  let token = "";
  let polledServiceIds: string[] = [];
  if (credential) {
    token = decrypt(credential.encToken, credential.iv, credential.authTag);
    // Find all active services for this credential to poll all of them
    const activeServices = db
      .select()
      .from(services)
      .where(
        and(
          eq(services.credentialId, credential.id),
          eq(services.active, true),
        ),
      )
      .all();

    polledServiceIds = activeServices.map((s) => s.providerSvcId);
    if (!polledServiceIds.includes(serviceId)) {
      polledServiceIds.push(serviceId);
    }

    for (const svcId of polledServiceIds) {
      streamPollerManager.startPoller(normalizedProvider, svcId, token);
    }
  }

  sseManager.addClient(user.id, normalizedProvider, serviceId, reply);

  // Clean up when client closes
  reply.raw.on("close", () => {
    if (token) {
      for (const svcId of polledServiceIds) {
        streamPollerManager.stopPoller(normalizedProvider, svcId, token);
      }
    }
  });

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
