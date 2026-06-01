import axios from "axios";
import { BasePoller } from "./BasePoller.js";
import { EventBus } from "../sse/EventBus.js";
import { budgetManager } from "../polling/BudgetManager.js";
import { ProviderType } from "@repo/shared/types";

export class HerokuClient extends BasePoller {
  private lastLogTimestamp = new Map<string, number>();
  private buildCursors = new Map<string, string>();

  constructor(token: string) {
    super("heroku", token);
  }

  async poll(serviceId: string, logType: "app" | "build"): Promise<number> {
    await this.checkBudget();

    if (logType === "build") {
      try {
        const buildsRes = await axios.get<Array<{ id: string; status: string; output_stream_url?: string; created_at: string }>>(
          `https://api.heroku.com/apps/${serviceId}/builds`,
          {
            headers: {
              Accept: "application/vnd.heroku+json; version=3",
              Authorization: `Bearer ${this.token}`,
            },
          }
        );
        await budgetManager.consume("heroku");

        const latestBuild = buildsRes.data?.[0];
        if (!latestBuild?.id) {
          return 0;
        }

        const lastBuildId = this.buildCursors.get(`${serviceId}:build`);
        if (lastBuildId === latestBuild.id) {
          return 0;
        }

        const logs: Array<{
          id: string;
          timestamp: string;
          serviceId: string;
          provider: ProviderType;
          level: string;
          message: string;
          type: "build";
        }> = [];

        // If output_stream_url is available, fetch build output
        if (latestBuild.output_stream_url) {
          try {
            const streamRes = await axios.get<string>(latestBuild.output_stream_url);
            const rawText = streamRes.data || "";
            const lines = rawText.split("\n").filter((l) => l.trim());
            
            for (const line of lines) {
              logs.push({
                id: `${latestBuild.id}-${Date.now()}-${Math.random()}`,
                timestamp: new Date().toISOString(),
                serviceId,
                provider: ProviderType.HEROKU,
                level: "info",
                message: line,
                type: "build",
              });
            }
          } catch (err) {
            console.warn("Failed to fetch Heroku build output stream:", err);
          }
        }

        // Always emit build status
        logs.push({
          id: `build-${latestBuild.id}-${Date.now()}`,
          timestamp: new Date(latestBuild.created_at).toISOString(),
          serviceId,
          provider: ProviderType.HEROKU,
          level: latestBuild.status === "failed" ? "error" : "info",
          message: `[build:${latestBuild.id}] Status: ${latestBuild.status}`,
          type: "build",
        });

        this.buildCursors.set(`${serviceId}:build`, latestBuild.id);
        
        if (logs.length > 0) {
          EventBus.emit("log", logs);
        }
        return logs.length;
      } catch (err) {
        console.warn("Failed to fetch Heroku build logs:", err);
        return 0;
      }
    }

    try {
      const cursorKey = `${serviceId}:app`;
      // Create a log session to fetch recent logs
      const sessionRes = await axios.post(
        `https://api.heroku.com/apps/${serviceId}/log-sessions`,
        {
          lines: 100,
          tail: false,
        },
        {
          headers: {
            Accept: "application/vnd.heroku+json; version=3",
            Authorization: `Bearer ${this.token}`,
          },
        }
      );

      await budgetManager.consume("heroku");

      const logplexUrl = sessionRes.data?.logplex_url;
      if (!logplexUrl) {
        return 0;
      }

      // Fetch logs from logplexUrl (returns plain text)
      const logsRes = await axios.get(logplexUrl, {
        headers: { Accept: "text/plain" },
        timeout: 10000,
      });

      const logText = logsRes.data;
      if (typeof logText !== "string" || !logText.trim()) {
        return 0;
      }

      const lines = logText.split("\n").filter((line) => line.trim());
      const events: import("@repo/shared/types").LogEvent[] = [];
      const since = this.lastLogTimestamp.get(cursorKey) || 0;
      let newestTimestamp = since;

      for (const line of lines) {
        const match = line.match(/^([^\s]+)\s+([^:]+):\s+(.*)$/);
        if (match) {
          const timestampStr = match[1];
          const source = match[2];
          const message = match[3];

          if (timestampStr && source && message) {
            const timestampMs = Date.parse(timestampStr);
            if (!isNaN(timestampMs) && timestampMs > since) {
              events.push({
                id: `${timestampStr}-${source}-${Math.random()}`,
                timestamp: new Date(timestampMs).toISOString(),
                serviceId,
                provider: ProviderType.HEROKU,
                level: source.includes("err") ? "error" : "info",
                message: `[${source}] ${message}`,
                type: "app" as const,
              });

              if (timestampMs > newestTimestamp) {
                newestTimestamp = timestampMs;
              }
            }
          } else {
            events.push({
              id: Math.random().toString(),
              timestamp: new Date().toISOString(),
              serviceId,
              provider: ProviderType.HEROKU,
              level: "info",
              message: line,
              type: "app" as const,
            });
          }
        } else {
          events.push({
            id: Math.random().toString(),
            timestamp: new Date().toISOString(),
            serviceId,
            provider: ProviderType.HEROKU,
            level: "info",
            message: line,
            type: "app" as const,
          });
        }
      }

      if (newestTimestamp > since) {
        this.lastLogTimestamp.set(cursorKey, newestTimestamp);
      }

      if (events.length > 0) {
        EventBus.emit("log", events);
      }
      return events.length;
    } catch (e) {
      if (axios.isAxiosError(e)) {
        if (e.response?.status === 429) {
          throw new Error("Rate limit");
        }
        if (e.response?.status === 404) {
          return 0;
        }
        console.error(`Failed to poll Heroku service ${serviceId}:`, e.message);
      } else {
        console.error(`Failed to poll Heroku service ${serviceId}:`, e);
      }
      throw e;
    }
  }
}
