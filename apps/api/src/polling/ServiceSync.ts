import crypto from "crypto";
import { RATE_LIMITS } from "@repo/shared/constants";
import { and, eq, inArray } from "drizzle-orm";
import { decrypt } from "../crypto/index.js";
import { db } from "../db/index.js";
import { credentials, services } from "../db/schema.js";
import { listProviderApps } from "../providers/providerApps.js";
import { pollingScheduler } from "./PollingScheduler.js";

type CredentialRow = typeof credentials.$inferSelect;

function jobKey(provider: string, credentialId: string) {
  return `${provider}_${credentialId}`;
}

export async function syncServicesForCredential(credential: CredentialRow) {
  const token = decrypt(credential.encToken, credential.iv, credential.authTag);
  const discoveredApps = await listProviderApps(credential.provider, token);
  const now = new Date();

  for (const app of discoveredApps) {
    const existing = db
      .select({ id: services.id })
      .from(services)
      .where(
        and(
          eq(services.credentialId, credential.id),
          eq(services.providerSvcId, app.id),
        ),
      )
      .get();

    if (existing) {
      db.update(services)
        .set({
          name: app.name,
          active: true,
          lastSeen: now,
        })
        .where(eq(services.id, existing.id))
        .run();
      continue;
    }

    db.insert(services)
      .values({
        id: crypto.randomUUID(),
        credentialId: credential.id,
        providerSvcId: app.id,
        name: app.name,
        type: null,
        repoUrl: null,
        active: true,
        lastSeen: now,
      })
      .run();
  }

  const discoveredIds = discoveredApps.map((app) => app.id);
  if (discoveredIds.length === 0) {
    db.update(services)
      .set({ active: false, lastSeen: now })
      .where(eq(services.credentialId, credential.id))
      .run();
    return;
  }

  const keepServiceRows = db
    .select({ id: services.id })
    .from(services)
    .where(
      and(
        eq(services.credentialId, credential.id),
        inArray(services.providerSvcId, discoveredIds),
      ),
    )
    .all();
  const keepServiceIds = new Set(keepServiceRows.map((row) => row.id));

  const allCredentialServices = db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.credentialId, credential.id))
    .all();

  for (const service of allCredentialServices) {
    if (!keepServiceIds.has(service.id)) {
      db.update(services)
        .set({ active: false, lastSeen: now })
        .where(eq(services.id, service.id))
        .run();
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
    const allCredentials = db.select().from(credentials).all();
    const nextKeys = new Set<string>();

    for (const credential of allCredentials) {
      const key = jobKey(credential.provider, credential.id);
      nextKeys.add(key);

      const intervalMs =
        Math.max(
          60000,
          RATE_LIMITS[credential.provider as keyof typeof RATE_LIMITS]
            ?.pollIntervalMs || 60000,
        );

      pollingScheduler.startPolling(
        credential.provider,
        credential.id,
        intervalMs,
        async () => {
          const latest = db
            .select()
            .from(credentials)
            .where(eq(credentials.id, credential.id))
            .get();
          if (!latest) {
            pollingScheduler.stopPolling(credential.provider, credential.id);
            this.scheduledKeys.delete(key);
            return;
          }

          await syncServicesForCredential(latest);
        },
      );
    }

    for (const previous of this.scheduledKeys) {
      if (!nextKeys.has(previous)) {
        const separator = previous.indexOf("_");
        if (separator !== -1) {
          const provider = previous.slice(0, separator);
          const credentialId = previous.slice(separator + 1);
          pollingScheduler.stopPolling(provider, credentialId);
        }
      }
    }

    this.scheduledKeys = nextKeys;
  }

  async runOneSyncPass() {
    const allCredentials = db.select().from(credentials).all();
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
