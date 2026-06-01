import { RenderClient } from "../providers/RenderClient.js";
import { VercelClient } from "../providers/VercelClient.js";
import { HerokuClient } from "../providers/HerokuClient.js";
import { CloudflareClient } from "../providers/CloudflareClient.js";
import { normalizeProvider } from "../providers/registry.js";
import type { BasePoller } from "../providers/BasePoller.js";
import { sseManager } from "../sse/SSEManager.js";

type PollerEntry = {
  client: BasePoller;
  stop: () => void;
  refCount: number;
};

export class StreamPollerManager {
  private activePollers = new Map<string, PollerEntry>();

  startPoller(provider: string, serviceId: string, token: string) {
    const normalized = normalizeProvider(provider);
    if (!normalized) return;

    const key = `${normalized}:${serviceId}:${token}`;
    const existing = this.activePollers.get(key);

    if (existing) {
      existing.refCount++;
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
    } else {
      return;
    }

    let delay = 3000;
    let timer: NodeJS.Timeout | null = null;
    let isStopped = false;

    const run = async () => {
      if (isStopped) return;
      try {
        const count = await client.poll(serviceId);
        if (delay === 60000) {
          sseManager.sendRateLimitCleared(normalized, serviceId);
        }
        if (count > 0) {
          delay = 3000; // Reset to 3 seconds if logs are actively streaming
        } else {
          delay = Math.min(delay + 2000, 15000); // Back off up to 15 seconds if no logs
        }
      } catch (err) {
        const error = err as Error;
        console.error(`Error polling logs for ${key}:`, error);
        if (error.message && error.message.includes("Rate limit")) {
          delay = 60000; // Back off to 60 seconds if rate limit is reached
          sseManager.sendRateLimitWarning(normalized, serviceId);
        } else {
          delay = Math.min(delay * 2, 30000); // Standard error backoff
        }
      }

      if (!isStopped) {
        timer = setTimeout(run, delay);
      }
    };

    run();

    this.activePollers.set(key, {
      client,
      stop: () => {
        isStopped = true;
        if (timer) {
          clearTimeout(timer);
        }
      },
      refCount: 1,
    });
  }

  stopPoller(provider: string, serviceId: string, token: string) {
    const normalized = normalizeProvider(provider);
    if (!normalized) return;

    const key = `${normalized}:${serviceId}:${token}`;
    const existing = this.activePollers.get(key);

    if (existing) {
      existing.refCount--;
      if (existing.refCount <= 0) {
        existing.stop();
        this.activePollers.delete(key);
      }
    }
  }
}

export const streamPollerManager = new StreamPollerManager();
