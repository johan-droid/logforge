import crypto from "node:crypto";
import type { LogEvent } from "@repo/shared/types";
import { db } from "../db/index.js";
import { logs } from "../db/schema.js";

export async function persistLogEvents(events: LogEvent[]) {
  if (events.length === 0) {
    return;
  }

  await db
    .insert(logs)
    .values(
      events.map((event) => ({
        id: event.id || crypto.randomUUID(),
        serviceId: event.serviceId,
        timestamp: new Date(event.timestamp),
        level: event.level || "info",
        message: event.message,
      })),
    )
    .onConflictDoNothing();
}
