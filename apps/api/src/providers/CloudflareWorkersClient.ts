import WebSocket from "ws";
import { ProviderType } from "@repo/shared/types";
import { persistLogEvents } from "./logPersistence.js";
import { EventBus } from "../sse/EventBus.js";
import { budgetManager } from "../polling/BudgetManager.js";

type TailSession = {
  id: string;
  url: string;
  expiresAt: number;
};

export class CloudflareWorkersClient {
  private ws: { close: () => void } | null = null;
  private tail: TailSession | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private token: string,
    private accountId: string,
    private scriptName: string,
    private serviceId: string,
  ) {}

  async start() {
    await this.createTailAndConnect();
  }

  stop() {
    this.stopped = true;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
  }

  private async createTailAndConnect() {
    if (this.stopped) {
      return;
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/workers/scripts/${this.scriptName}/tails`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}` },
      },
    );
    if (!response.ok) {
      throw new Error(`Cloudflare tail creation failed: ${response.status}`);
    }

    const json = (await response.json()) as {
      result: { id: string; url: string; expires_at: string };
    };
    await budgetManager.consume("cloudflare");

    this.tail = {
      id: json.result.id,
      url: json.result.url,
      expiresAt: new Date(json.result.expires_at).getTime(),
    };

    this.ws?.close();
    const socket = new WebSocket(this.tail.url, "trace-v1") as any;
    this.ws = socket;
    socket.on("message", (data: { toString: () => string }) => {
      void this.handleMessage(data.toString());
    });
    socket.on("close", () => this.handleClose());
    socket.on("error", () => this.handleClose());

    const refreshIn = Math.max(5000, this.tail.expiresAt - Date.now() - 30000);
    this.refreshTimer = setTimeout(() => {
      void this.createTailAndConnect();
    }, refreshIn);
  }

  async handleMessage(raw: string | ArrayBuffer) {
    try {
      const data =
        typeof raw === "string"
          ? (JSON.parse(raw) as {
              logs?: Array<{ message?: unknown[]; level?: string; timestamp?: number }>;
              exceptions?: Array<{ name: string; message: string }>;
              eventTimestamp?: number;
            })
          : (JSON.parse(Buffer.from(raw).toString("utf8")) as {
              logs?: Array<{ message?: unknown[]; level?: string; timestamp?: number }>;
              exceptions?: Array<{ name: string; message: string }>;
              eventTimestamp?: number;
            });

      const events = (data.logs || []).map((log) => ({
        id: `${this.scriptName}-${data.eventTimestamp || Date.now()}-${Math.random()}`,
        timestamp: new Date(
          log.timestamp || data.eventTimestamp || Date.now(),
        ).toISOString(),
        serviceId: this.serviceId,
        provider: ProviderType.CLOUDFLARE,
        level: log.level === "error" ? "error" : "info",
        message: Array.isArray(log.message)
          ? log.message.map(String).join(" ")
          : String(log.message ?? ""),
        type: "app" as const,
      }));

      if (data.exceptions?.length) {
        for (const exception of data.exceptions) {
          events.push({
            id: `${this.scriptName}-exception-${Date.now()}-${Math.random()}`,
            timestamp: new Date(data.eventTimestamp || Date.now()).toISOString(),
            serviceId: this.serviceId,
            provider: ProviderType.CLOUDFLARE,
            level: "error",
            message: `[exception] ${exception.name}: ${exception.message}`,
            type: "app" as const,
          });
        }
      }

      if (events.length > 0) {
        await persistLogEvents(events);
        EventBus.emit("log", events);
      }
    } catch {
      // Malformed frames should not kill the tail session.
    }
  }

  private handleClose() {
    if (this.stopped) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      void this.createTailAndConnect();
    }, 2000);
  }
}
