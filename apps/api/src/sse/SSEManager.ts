import { FastifyReply } from "fastify";
import { EventBus } from "./EventBus.js";
import type { LogEvent } from "@repo/shared/types";

type Client = {
  reply: FastifyReply;
  userId: string;
  provider: string;
  serviceId: string;
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
    reply: FastifyReply,
  ) {
    const client: Client = { userId, provider, serviceId, reply };
    this.clients.add(client);
    reply.raw.write(
      `event: ready\ndata: ${JSON.stringify({ provider, serviceId })}\n\n`,
    );

    reply.raw.on("close", () => {
      this.clients.delete(client);
    });
  }

  private broadcast(events: LogEvent[]) {
    if (events.length === 0) return;

    const eventsByService = new Map<string, LogEvent[]>();
    for (const event of events) {
      const key = `${event.provider}:${event.serviceId}`;
      if (!eventsByService.has(key)) {
        eventsByService.set(key, []);
      }
      eventsByService.get(key)!.push(event);
    }

    for (const client of this.clients) {
      const serviceEvents = eventsByService.get(
        `${client.provider}:${client.serviceId}`,
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
