import type { FastifyInstance } from "fastify";
import type { Server } from "socket.io";
import type { LogEvent, SessionUser } from "@repo/shared/types";
import { EventBus } from "../sse/EventBus.js";
import { getSessionTokenFromHeaders } from "../auth/session.js";
import { normalizeProvider } from "../providers/registry.js";

type SubscribePayload = {
  provider: string;
  serviceId: string;
};

function roomName(provider: string, serviceId: string) {
  return `log:${provider}:${serviceId}`;
}

export class SocketLogManager {
  constructor(
    private readonly io: Server,
    private readonly fastify: FastifyInstance,
  ) {
    this.io.use(async (socket, next) => {
      try {
        const token = getSessionTokenFromHeaders(socket.request.headers);
        if (!token) {
          next(new Error("Unauthorized"));
          return;
        }

        const user = await this.fastify.jwt.verify<SessionUser>(token);
        socket.data.user = user;
        socket.data.subscriptions = new Set<string>();
        next();
      } catch {
        next(new Error("Unauthorized"));
      }
    });

    this.io.on("connection", (socket) => {
      socket.on("subscribe", (payload: SubscribePayload, ack?: (response: { ok: boolean; error?: string }) => void) => {
        const normalizedProvider = normalizeProvider(payload?.provider || "");
        if (!normalizedProvider || !payload?.serviceId) {
          ack?.({ ok: false, error: "Unsupported provider or service" });
          return;
        }

        const room = roomName(normalizedProvider, payload.serviceId);
        socket.join(room);
        socket.data.subscriptions?.add(room);
        socket.emit("ready", {
          provider: normalizedProvider,
          serviceId: payload.serviceId,
        });
        ack?.({ ok: true });
      });

      socket.on("unsubscribe", (payload: SubscribePayload) => {
        const normalizedProvider = normalizeProvider(payload?.provider || "");
        if (!normalizedProvider || !payload?.serviceId) {
          return;
        }

        const room = roomName(normalizedProvider, payload.serviceId);
        socket.leave(room);
        socket.data.subscriptions?.delete(room);
      });
    });

    EventBus.on("log", (events: LogEvent[]) => {
      this.broadcast(events);
    });
  }

  private broadcast(events: LogEvent[]) {
    if (events.length === 0) {
      return;
    }

    const eventsByRoom = new Map<string, LogEvent[]>();
    for (const event of events) {
      const room = roomName(event.provider, event.serviceId);
      const roomEvents = eventsByRoom.get(room);
      if (roomEvents) {
        roomEvents.push(event);
      } else {
        eventsByRoom.set(room, [event]);
      }
    }

    for (const [room, serviceEvents] of eventsByRoom) {
      this.io.to(room).emit("log", serviceEvents);
    }
  }
}