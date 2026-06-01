import { FastifyReply } from "fastify";
import { EventBus } from "./EventBus.js";
import type { LogEvent } from "@repo/shared/types";

type Client = {
  reply: FastifyReply;
  userId: string;
  provider: string;
  serviceId: string;
  logType: "app" | "build";
};

export class SSEManager {
  private clients: Set<Client> = new Set();

  constructor() {
    EventBus.on("log", (events: LogEvent[]) => {
      this.broadcast(events);
    });
  }

  addClient(
    userId: string,
    provider: string,
    serviceId: string,
    logType: "app" | "build",
    reply: FastifyReply,
  ) {
    const client: Client = { userId, provider, serviceId, logType, reply };
    this.clients.add(client);
    reply.raw.write(
      `event: ready\ndata: ${JSON.stringify({ provider, serviceId, logType })}\n\n`,
    );

    reply.raw.on("close", () => {
      this.clients.delete(client);
    });
  }

  sendRateLimitWarning(provider: string, serviceId: string) {
    for (const client of this.clients) {
      if (client.provider === provider && client.serviceId === serviceId) {
        try {
          client.reply.raw.write(
            `event: rate-limit\ndata: ${JSON.stringify({ provider, serviceId })}\n\n`
          );
        } catch {
          this.clients.delete(client);
        }
      }
    }
  }

  sendRateLimitCleared(provider: string, serviceId: string) {
    for (const client of this.clients) {
      if (client.provider === provider && client.serviceId === serviceId) {
        try {
          client.reply.raw.write(
            `event: rate-limit-cleared\ndata: ${JSON.stringify({ provider, serviceId })}\n\n`
          );
        } catch {
          this.clients.delete(client);
        }
      }
    }
  }

  private broadcast(events: LogEvent[]) {
    if (events.length === 0) return;

    const eventsByServiceAndType = new Map<string, LogEvent[]>();
    for (const event of events) {
      const type = event.type || "app";
      const key = `${event.provider}:${event.serviceId}:${type}`;
      if (!eventsByServiceAndType.has(key)) {
        eventsByServiceAndType.set(key, []);
      }
      eventsByServiceAndType.get(key)!.push(event);
    }

    for (const client of this.clients) {
      const serviceEvents = eventsByServiceAndType.get(
        `${client.provider}:${client.serviceId}:${client.logType}`,
      );
      if (serviceEvents && serviceEvents.length > 0) {
        try {
          client.reply.raw.write(`data: ${JSON.stringify(serviceEvents)}\n\n`);
        } catch {
          this.clients.delete(client);
        }
      }
    }
  }
}

export const sseManager = new SSEManager();
