import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { createRedisClient, isRedisConfigured } from "../redis.js";

const PROCESS_ID = crypto.randomUUID();

type DistributedPayload = {
  _originId: string;
  events: unknown;
};

class DistributedEventBus extends EventEmitter {
  private pub = isRedisConfigured() ? createRedisClient() : null;
  private sub = isRedisConfigured() ? createRedisClient() : null;

  constructor() {
    super();

    if (this.sub) {
      void this.sub.subscribe("logforge:logs");
      this.sub.on("message", (_channel: string, message: string) => {
        try {
          const payload = JSON.parse(message) as DistributedPayload;
          if (payload._originId !== PROCESS_ID) {
            super.emit("log", payload.events);
          }
        } catch {
          // Ignore malformed pub/sub messages.
        }
      });
    }
  }

  override emit(event: string | symbol, ...args: unknown[]) {
    if (event === "log" && this.pub) {
      const payload: DistributedPayload = {
        _originId: PROCESS_ID,
        events: args[0],
      };
      void this.pub
        .publish("logforge:logs", JSON.stringify(payload))
        .catch((error: { message?: string }) => {
          console.error("Redis publish failed:", error.message);
        });
    }

    return super.emit(event, ...args);
  }
}

export const EventBus = new DistributedEventBus();
