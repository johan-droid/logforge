import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { createRedisClient } from "../redis.js";

const PROCESS_ID = crypto.randomUUID();

type DistributedPayload = {
  _originId: string;
  events: unknown;
};

class DistributedEventBus extends EventEmitter {
  private pub = createRedisClient();
  private sub = createRedisClient();

  constructor() {
    super();

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

  override emit(event: string | symbol, ...args: unknown[]) {
    if (event === "log") {
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
