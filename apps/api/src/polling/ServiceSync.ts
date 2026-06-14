import crypto from "node:crypto";
import { RATE_LIMITS } from "@repo/shared/constants";
import { and, eq, inArray } from "drizzle-orm";
import { decrypt } from "../crypto/index.js";
import { db } from "../db/index.js";
import { credentials, services } from "../db/schema.js";
import { listProviderApps } from "../providers/providerApps.js";
import { serviceSyncQueue } from "./queue.js";

type CredentialRow = typeof credentials.$inferSelect;

function jobKey(provider: string, credentialId: string) {
  return `${provider}_${credentialId}`;
}

export async function syncServicesForCredential(credential: CredentialRow) {
  const token = decrypt(
    credential.encToken,
    credential.iv,
    credential.authTag,
    credential.keyVersion,
  );
  const discoveredApps = await listProviderApps(credential.provider, token);
  const now = new Date();

  for (const app of discoveredApps) {
    const existingRows = await db
      .select({ id: services.id })
      .from(services)
      .where(
        and(
          eq(services.credentialId, credential.id),
          eq(services.providerSvcId, app.id),
        ),
      );
    const existing = existingRows[0];

    if (existing) {
      await db
        .update(services)
        .set({
          name: app.name,
          type: app.type ?? null,
          providerProjectId: app.projectId ?? null,
          active: true,
          lastSeen: now,
        })
        .where(eq(services.id, existing.id));
      continue;
    }

    await db.insert(services).values({
      id: crypto.randomUUID(),
      credentialId: credential.id,
      providerSvcId: app.id,
      providerProjectId: app.projectId ?? null,
      name: app.name,
      type: app.type ?? null,
      repoUrl: null,
      active: true,
      lastSeen: now,
    });
  }

  const discoveredIds = discoveredApps.map((app) => app.id);
  if (discoveredIds.length === 0) {
    await db
      .update(services)
      .set({ active: false, lastSeen: now })
      .where(eq(services.credentialId, credential.id));
    return;
  }

  const keepServiceRows = await db
    .select({ id: services.id })
    .from(services)
    .where(
      and(
        eq(services.credentialId, credential.id),
        inArray(services.providerSvcId, discoveredIds),
      ),
    );
  const keepServiceIds = new Set(keepServiceRows.map((row) => row.id));

  const allCredentialServices = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.credentialId, credential.id));

  for (const service of allCredentialServices) {
    if (!keepServiceIds.has(service.id)) {
      await db
        .update(services)
        .set({ active: false, lastSeen: now })
        .where(eq(services.id, service.id));
    }
  }
}

export class ServiceSyncCoordinator {
  private scheduledKeys = new Set<string>();

  async bootstrap() {
    await this.refreshSchedules();
    await this.runOneSyncPass();
  }

  async refreshSchedules() {
    const allCredentials = await db.select().from(credentials);
    const nextKeys = new Set<string>();
    const repeatableJobs = (await serviceSyncQueue.getRepeatableJobs()) as Array<{
      id?: string;
      key: string;
    }>;

    for (const credential of allCredentials) {
      const key = jobKey(credential.provider, credential.id);
      nextKeys.add(key);

      const intervalMs = Math.max(
        60000,
        RATE_LIMITS[credential.provider as keyof typeof RATE_LIMITS]?.pollIntervalMs ||
          60000,
      );

      const alreadyScheduled = repeatableJobs.some((job) => job.id === key);
      if (!alreadyScheduled) {
        await serviceSyncQueue.add(
          key,
          { credentialId: credential.id },
          { repeat: { every: intervalMs }, jobId: key },
        );
      }
    }

    for (const previous of this.scheduledKeys) {
      if (nextKeys.has(previous)) {
        continue;
      }

      const repeatable = repeatableJobs.find((job) => job.id === previous);
      if (repeatable) {
        await serviceSyncQueue.removeRepeatableByKey(repeatable.key);
      }
    }

    this.scheduledKeys = nextKeys;
  }

  async runOneSyncPass() {
    const allCredentials = await db.select().from(credentials);
    for (const credential of allCredentials) {
      try {
        await syncServicesForCredential(credential);
      } catch (error) {
        console.warn("Service sync failed", {
          provider: credential.provider,
          credentialId: credential.id,
          error,
        });
      }
    }
  }
}

export const serviceSyncCoordinator = new ServiceSyncCoordinator();
