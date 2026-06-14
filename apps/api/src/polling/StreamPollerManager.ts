import crypto, { createHash } from "node:crypto";
import { CloudflareClient } from "../providers/CloudflareClient.js";
import { CloudflareWorkersClient } from "../providers/CloudflareWorkersClient.js";
import type { BasePoller, PollContext } from "../providers/BasePoller.js";
import { HerokuClient } from "../providers/HerokuClient.js";
import { RailwayClient } from "../providers/RailwayClient.js";
import { RenderClient } from "../providers/RenderClient.js";
import { VercelClient } from "../providers/VercelClient.js";
import { getCloudflareAccountId } from "../providers/providerApps.js";
import { normalizeProvider } from "../providers/registry.js";
import { createRedisClient, isRedisConfigured } from "../redis.js";
import { sseManager } from "../sse/SSEManager.js";

type PollerEntry = {
  client: BasePoller;
  stop: () => void;
  refCount: number;
};

const INSTANCE_ID = crypto.randomUUID();

export class StreamPollerManager {
  private activePollers = new Map<string, PollerEntry>();
  private activeWorkerTails = new Map<
    string,
    { client: CloudflareWorkersClient; refCount: number }
  >();
  private redis = isRedisConfigured() ? createRedisClient() : null;

  async startPoller(
    provider: string,
    serviceId: string,
    logType: "app" | "build",
    token: string,
    context: PollContext = {},
  ) {
    const normalized = normalizeProvider(provider);
    if (!normalized) {
      return;
    }

    const tokenFingerprint = createHash("sha256")
      .update(token)
      .digest("hex")
      .slice(0, 12);

    if (normalized === "cloudflare" && context.serviceType === "worker") {
      const tailKey = `cloudflare-worker:${serviceId}:${tokenFingerprint}`;
      const existingTail = this.activeWorkerTails.get(tailKey);
      if (existingTail) {
        existingTail.refCount++;
        return;
      }

      const accountId = await getCloudflareAccountId(token);
      if (!accountId) {
        return;
      }

      const client = new CloudflareWorkersClient(token, accountId, serviceId, serviceId);
      await client.start();
      this.activeWorkerTails.set(tailKey, { client, refCount: 1 });
      return;
    }

    const key = `${normalized}:${serviceId}:${logType}:${tokenFingerprint}`;
    const existing = this.activePollers.get(key);
    if (existing) {
      existing.refCount++;
      return;
    }

    const lockKey = `poller-lock:${normalized}:${serviceId}:${logType}`;
    const acquiredLock = await this.acquireLock(lockKey);
    if (!acquiredLock) {
      return;
    }

    let client: BasePoller;
    if (normalized === "render") {
      client = new RenderClient(token);
    } else if (normalized === "vercel") {
      client = new VercelClient(token);
    } else if (normalized === "heroku") {
      client = new HerokuClient(token);
    } else if (normalized === "cloudflare") {
      client = new CloudflareClient(token);
    } else if (normalized === "railway") {
      client = new RailwayClient(token);
    } else {
      return;
    }

    let delay = 3000;
    let timer: NodeJS.Timeout | null = null;
    let isStopped = false;

    const run = async () => {
      if (isStopped) {
        return;
      }

      try {
        const count = await client.poll(serviceId, logType, context);
        await this.refreshLock(lockKey);
        if (delay === 60000) {
          sseManager.sendRateLimitCleared(normalized, serviceId);
        }
        delay = count > 0 ? 3000 : Math.min(delay + 2000, 15000);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error polling logs for ${key}:`, error);
        if (message.includes("Rate limit")) {
          delay = 60000;
          sseManager.sendRateLimitWarning(normalized, serviceId);
        } else {
          delay = Math.min(delay * 2, 30000);
        }
      }

      if (!isStopped) {
        timer = setTimeout(() => {
          void run();
        }, delay);
      }
    };

    void run();

    this.activePollers.set(key, {
      client,
      stop: () => {
        isStopped = true;
        if (timer) {
          clearTimeout(timer);
        }
        void this.releaseLock(lockKey);
      },
      refCount: 1,
    });
  }

  stopPoller(
    provider: string,
    serviceId: string,
    logType: "app" | "build",
    token: string,
    context: PollContext = {},
  ) {
    const normalized = normalizeProvider(provider);
    if (!normalized) {
      return;
    }

    const tokenFingerprint = createHash("sha256")
      .update(token)
      .digest("hex")
      .slice(0, 12);

    if (normalized === "cloudflare" && context.serviceType === "worker") {
      const tailKey = `cloudflare-worker:${serviceId}:${tokenFingerprint}`;
      const existingTail = this.activeWorkerTails.get(tailKey);
      if (!existingTail) {
        return;
      }

      existingTail.refCount--;
      if (existingTail.refCount <= 0) {
        existingTail.client.stop();
        this.activeWorkerTails.delete(tailKey);
      }
      return;
    }

    const key = `${normalized}:${serviceId}:${logType}:${tokenFingerprint}`;
    const existing = this.activePollers.get(key);
    if (!existing) {
      return;
    }

    existing.refCount--;
    if (existing.refCount <= 0) {
      existing.stop();
      this.activePollers.delete(key);
    }
  }

  private async acquireLock(lockKey: string) {
    if (!this.redis) {
      return true;
    }
    const result = await this.redis.set(lockKey, INSTANCE_ID, "EX", 30, "NX");
    return result === "OK";
  }

  private async refreshLock(lockKey: string) {
    if (!this.redis) {
      return true;
    }
    const currentOwner = await this.redis.get(lockKey);
    if (currentOwner !== INSTANCE_ID) {
      return false;
    }
    await this.redis.set(lockKey, INSTANCE_ID, "EX", 30, "XX");
    return true;
  }

  private async releaseLock(lockKey: string) {
    if (!this.redis) {
      return;
    }
    const currentOwner = await this.redis.get(lockKey);
    if (currentOwner === INSTANCE_ID) {
      await this.redis.del(lockKey);
    }
  }
}

export const streamPollerManager = new StreamPollerManager();
