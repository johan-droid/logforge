import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import type { SessionUser } from "./session.js";

function fallbackEmail(userId: string) {
  const safeId = userId.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
  return `${safeId || "user"}@local.logforge`;
}

export async function ensureUserRecord(user: SessionUser) {
  if (!user.id) {
    throw new Error("Session user id is required");
  }

  const existingRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, user.id));
  const existing = existingRows[0];
  const email = user.email?.trim();

  if (existing) {
    if (email) {
      await db.update(users).set({ email }).where(eq(users.id, user.id));
    }
    return;
  }

  await db.insert(users).values({
    id: user.id,
    email: email || fallbackEmail(user.id),
    passwordHash: `session:${user.id}`,
    createdAt: new Date(),
  });
}
