import "./test-env.js";
import crypto from "node:crypto";
import { db, initializeDatabase } from "./db/index.js";
import {
  credentials,
  logs,
  logCursors,
  rateLimitState,
  services,
  users,
} from "./db/schema.js";

export async function resetDatabase() {
  await initializeDatabase();
  await db.delete(logs);
  await db.delete(logCursors);
  await db.delete(services);
  await db.delete(credentials);
  await db.delete(users);
  await db.delete(rateLimitState);
}

export async function seedService(serviceId: string, provider: string) {
  const userId = `user-${serviceId}`;
  const credentialId = `cred-${serviceId}`;

  await db.insert(users).values({
    id: userId,
    email: `${serviceId}@example.com`,
    passwordHash: `session:${userId}`,
    createdAt: new Date(),
  });

  await db.insert(credentials).values({
    id: credentialId,
    userId,
    provider,
    label: provider,
    encToken: crypto.randomUUID(),
    iv: crypto.randomUUID(),
    authTag: crypto.randomUUID(),
    keyVersion: 1,
    createdAt: new Date(),
  });

  await db.insert(services).values({
    id: `svc-row-${serviceId}`,
    credentialId,
    providerSvcId: serviceId,
    providerProjectId: null,
    name: serviceId,
    type: null,
    repoUrl: null,
    active: true,
    lastSeen: new Date(),
  });
}
