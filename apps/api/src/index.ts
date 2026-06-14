import "./env.js";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import fastifyRateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { and, eq } from "drizzle-orm";
import authRoutes from "./routes/auth.js";
import credentialRoutes from "./routes/credentials.js";
import dataRoutes from "./routes/data.js";
import providerRoutes from "./routes/providers.js";
import valveRoutes from "./routes/valve.js";
import { requireSession } from "./auth/session.js";
import {
  assertEncryptionConfig,
  assertNotPlaceholder,
  decrypt,
} from "./crypto/index.js";
import { db, initializeDatabase } from "./db/index.js";
import { credentials, services } from "./db/schema.js";
import { serviceSyncCoordinator } from "./polling/ServiceSync.js";
import { startLogCleanupJob } from "./polling/LogCleanupJob.js";
import { streamPollerManager } from "./polling/StreamPollerManager.js";
import { normalizeProvider } from "./providers/registry.js";
import { SocketLogManager } from "./socket/SocketLogManager.js";
import { sseManager } from "./sse/SSEManager.js";
import { Server } from "socket.io";

const fastify = Fastify({ logger: true });

type RequestWithUser = {
  user?: { id?: string };
};

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

fastify.addHook("onRequest", async (request) => {
  const user = await request
    .jwtVerify<{ id?: string }>()
    .catch(() => undefined as { id?: string } | undefined);
  (request as unknown as RequestWithUser).user = user;
});

fastify.register(fastifyRateLimit, {
  max: 100,
  timeWindow: "1 minute",
  keyGenerator: (request) => {
    const user = (request as typeof request & RequestWithUser).user;
    return user?.id ? `user:${user.id}` : `ip:${request.ip}`;
  },
  errorResponseBuilder: (_request, context) => ({
    statusCode: 429,
    error: "Too Many Requests",
    message: `Rate limit exceeded, retry in ${context.after}.`,
  }),
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

fastify.get(
  "/api/stream/:provider/:serviceId",
  { config: { rateLimit: false } },
  async (request, reply) => {
    const { provider, serviceId } = request.params as {
      provider: string;
      serviceId: string;
    };
    const { type } = request.query as { type?: string };
    const logType = type === "build" ? "build" : "app";

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

    reply.hijack();
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    reply.raw.flushHeaders();

    const credentialRows = await db
      .select()
      .from(credentials)
      .where(
        and(
          eq(credentials.userId, user.id),
          eq(credentials.provider, normalizedProvider),
        ),
      );
    const credential = credentialRows[0];

    let token = "";
    let polledServices: Array<{
      id: string;
      serviceType: string | null;
      providerProjectId: string | null;
    }> = [];

    if (credential) {
      token = decrypt(
        credential.encToken,
        credential.iv,
        credential.authTag,
        credential.keyVersion,
      );

      const activeServices = await db
        .select({
          providerSvcId: services.providerSvcId,
          type: services.type,
          providerProjectId: services.providerProjectId,
        })
        .from(services)
        .where(
          and(
            eq(services.credentialId, credential.id),
            eq(services.active, true),
          ),
        );

      polledServices = activeServices.map((service) => ({
        id: service.providerSvcId,
        serviceType: service.type,
        providerProjectId: service.providerProjectId,
      }));

      if (!polledServices.some((service) => service.id === serviceId)) {
        polledServices.push({
          id: serviceId,
          serviceType: null,
          providerProjectId: null,
        });
      }

      for (const service of polledServices) {
        await streamPollerManager.startPoller(
          normalizedProvider,
          service.id,
          logType,
          token,
          {
            serviceType: service.serviceType,
            providerProjectId: service.providerProjectId,
          },
        );
      }
    }

    sseManager.addClient(user.id, normalizedProvider, serviceId, logType, reply);

    reply.raw.on("close", () => {
      if (!token) {
        return;
      }

      for (const service of polledServices) {
        streamPollerManager.stopPoller(normalizedProvider, service.id, logType, token, {
          serviceType: service.serviceType,
          providerProjectId: service.providerProjectId,
        });
      }
    });

    return;
  },
);

const start = async () => {
  try {
    assertEncryptionConfig();
    assertNotPlaceholder("JWT_SECRET", requiredEnv("JWT_SECRET"));
    assertNotPlaceholder("ENCRYPTION_KEY", process.env.ENCRYPTION_KEY ?? "");
    await initializeDatabase();
    startLogCleanupJob();
    await serviceSyncCoordinator.bootstrap();
    await fastify.listen({
      port: process.env.API_PORT
        ? parseInt(process.env.API_PORT, 10)
        : process.env.PORT
          ? parseInt(process.env.PORT, 10)
          : 3001,
      host: "0.0.0.0",
    });
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
};

void start();
