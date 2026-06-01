import { RenderClient } from "../providers/RenderClient.js";
import { VercelClient } from "../providers/VercelClient.js";
import { HerokuClient } from "../providers/HerokuClient.js";
import { CloudflareClient } from "../providers/CloudflareClient.js";
import { normalizeProvider } from "../providers/registry.js";
import type { BasePoller } from "../providers/BasePoller.js";

type PollerEntry = {
  client: BasePoller;
  interval: NodeJS.Timeout;
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

    // Trigger initial poll immediately
    client.poll(serviceId).catch((err) => {
      console.error(`Error in initial poll for ${key}:`, err);
    });

    // Run poll every 3 seconds
    const interval = setInterval(() => {
      client.poll(serviceId).catch((err) => {
        console.error(`Error polling logs for ${key}:`, err);
      });
    }, 3000);

    this.activePollers.set(key, {
      client,
      interval,
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
        clearInterval(existing.interval);
        this.activePollers.delete(key);
      }
    }
  }
}

export const streamPollerManager = new StreamPollerManager();
