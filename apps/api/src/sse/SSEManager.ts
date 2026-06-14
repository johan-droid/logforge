import type { LogEvent } from "@repo/shared/types";
import { FastifyReply } from "fastify";
import { EventBus } from "./EventBus.js";

type Client = {
  reply: FastifyReply;
  userId: string;
  provider: string;
  serviceId: string;
  logType: "app" | "build";
};

export class SSEManager {
  private clientsByRoom: Map<string, Set<Client>> = new Map();

  constructor() {
    EventBus.on("log", (events: LogEvent[]) => {
      this.broadcast(events);
    });
  }

  private roomKey(
    provider: string,
    serviceId: string,
    logType: "app" | "build",
  ) {
    return `${provider}:${serviceId}:${logType}`;
  }

  addClient(
    userId: string,
    provider: string,
    serviceId: string,
    logType: "app" | "build",
    reply: FastifyReply,
  ) {
    const client: Client = { userId, provider, serviceId, logType, reply };
    const key = this.roomKey(provider, serviceId, logType);
    if (!this.clientsByRoom.has(key)) {
      this.clientsByRoom.set(key, new Set());
    }
    this.clientsByRoom.get(key)!.add(client);

    reply.raw.write(
      `event: ready\ndata: ${JSON.stringify({ provider, serviceId, logType })}\n\n`,
    );
    reply.raw.on("close", () => {
      const room = this.clientsByRoom.get(key);
      room?.delete(client);
      if (room && room.size === 0) {
        this.clientsByRoom.delete(key);
      }
    });
  }

  sendRateLimitWarning(provider: string, serviceId: string) {
    this.emitRoomEvent("rate-limit", provider, serviceId);
  }

  sendRateLimitCleared(provider: string, serviceId: string) {
    this.emitRoomEvent("rate-limit-cleared", provider, serviceId);
  }

  private emitRoomEvent(
    eventName: "rate-limit" | "rate-limit-cleared",
    provider: string,
    serviceId: string,
  ) {
    for (const logType of ["app", "build"] as const) {
      const room = this.clientsByRoom.get(this.roomKey(provider, serviceId, logType));
      if (!room) {
        continue;
      }

      for (const client of room) {
        try {
          client.reply.raw.write(
            `event: ${eventName}\ndata: ${JSON.stringify({ provider, serviceId })}\n\n`,
          );
        } catch {
          room.delete(client);
        }
      }
    }
  }

  private broadcast(events: LogEvent[]) {
    if (events.length === 0) {
      return;
    }

    const grouped = new Map<string, LogEvent[]>();
    for (const event of events) {
      const type = event.type || "app";
      const key = this.roomKey(event.provider, event.serviceId, type);
      const roomEvents = grouped.get(key);
      if (roomEvents) {
        roomEvents.push(event);
      } else {
        grouped.set(key, [event]);
      }
    }

    for (const [key, roomEvents] of grouped) {
      const room = this.clientsByRoom.get(key);
      if (!room) {
        continue;
      }

      for (const client of room) {
        try {
          client.reply.raw.write(`data: ${JSON.stringify(roomEvents)}\n\n`);
        } catch {
          room.delete(client);
        }
      }
    }
  }
}

export const sseManager = new SSEManager();
