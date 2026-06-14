import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { logCursors } from "../db/schema.js";

export async function readCursor(
  cache: Map<string, string>,
  serviceId: string,
  logType: "app" | "build",
) {
  const cacheKey = `${serviceId}:${logType}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const rows = await db
    .select({ cursorValue: logCursors.cursorValue })
    .from(logCursors)
    .where(
      and(eq(logCursors.serviceId, serviceId), eq(logCursors.logType, logType)),
    );

  const value = rows[0]?.cursorValue;
  if (value) {
    cache.set(cacheKey, value);
  }

  return value;
}

export async function writeCursor(
  cache: Map<string, string>,
  serviceId: string,
  logType: "app" | "build",
  cursorValue: string,
) {
  const cacheKey = `${serviceId}:${logType}`;
  cache.set(cacheKey, cursorValue);

  await db
    .insert(logCursors)
    .values({
      serviceId,
      logType,
      cursorValue,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [logCursors.serviceId, logCursors.logType],
      set: {
        cursorValue,
        updatedAt: new Date(),
      },
    });
}
