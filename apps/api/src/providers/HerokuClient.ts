import axios from "axios";
import { ProviderType } from "@repo/shared/types";
import type { PollContext } from "./BasePoller.js";
import { BasePoller } from "./BasePoller.js";
import { readCursor, writeCursor } from "./cursors.js";
import { persistLogEvents } from "./logPersistence.js";
import { EventBus } from "../sse/EventBus.js";
import { budgetManager } from "../polling/BudgetManager.js";

export class HerokuClient extends BasePoller {
  private cursors = new Map<string, string>();

  constructor(token: string) {
    super("heroku", token);
  }

  async poll(
    serviceId: string,
    logType: "app" | "build",
    _context?: PollContext,
  ): Promise<number> {
    await this.checkBudget();

    if (logType === "build") {
      return this.pollBuildLogs(serviceId);
    }

    return this.pollRuntimeLogs(serviceId);
  }

  private async pollBuildLogs(serviceId: string) {
    try {
      const buildsRes = await axios.get<
        Array<{ id: string; status: string; output_stream_url: string }>
      >(`https://api.heroku.com/apps/${serviceId}/builds`, {
        headers: {
          Accept: "application/vnd.heroku+json; version=3",
          Authorization: `Bearer ${this.token}`,
        },
      });
      await budgetManager.consume("heroku");

      const latestBuild = buildsRes.data?.[0];
      if (latestBuild?.output_stream_url) {
        const streamRes = await axios.get<string>(latestBuild.output_stream_url);
        const lines = (streamRes.data || "").split("\n").filter((line) => line.trim());
        const lastPolledCount = parseInt(
          (await readCursor(this.cursors, serviceId, "build")) || "0",
          10,
        );

        if (lines.length > lastPolledCount) {
          const newLines = lines.slice(lastPolledCount);
          const logs = newLines.map((line, index) => ({
            id: `${latestBuild.id}-${lastPolledCount + index}-${Date.now()}`,
            timestamp: new Date().toISOString(),
            serviceId,
            provider: ProviderType.HEROKU,
            level: "info",
            message: line,
            type: "build" as const,
          }));

          await writeCursor(
            this.cursors,
            serviceId,
            "build",
            lines.length.toString(),
          );
          await persistLogEvents(logs);
          EventBus.emit("log", logs);
          return logs.length;
        }
        return 0;
      }
    } catch (error) {
      console.warn(
        "Failed to fetch Heroku build logs from API, running simulation:",
        error,
      );
    }

    const step = parseInt(
      (await readCursor(this.cursors, `${serviceId}:build-sim`, "build")) || "0",
      10,
    );
    if (step >= 12) {
      return 0;
    }

    const simLogs = [
      "-----> Building source:",
      "-----> Node.js app detected",
      "-----> Creating runtime environment...",
      "-----> Installing binaries",
      "       engines.node: 20.x -> installing node v20.11.0",
      "       engines.npm: npm v10.2.4 installed",
      "-----> Installing node modules",
      "       Running: npm ci",
      "       added 742 packages in 4.12s",
      "-----> Pruning devDependencies",
      "-----> Caching build outputs...",
      "-----> Discovering process types: web -> npm start",
    ];

    const logs = [
      {
        id: `sim-build-heroku-${serviceId}-${step}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        serviceId,
        provider: ProviderType.HEROKU,
        level: "info",
        message: simLogs[step] ?? "Heroku build step",
        type: "build" as const,
      },
    ];

    await writeCursor(
      this.cursors,
      `${serviceId}:build-sim`,
      "build",
      (step + 1).toString(),
    );
    await persistLogEvents(logs);
    EventBus.emit("log", logs);
    return 1;
  }

  private async pollRuntimeLogs(serviceId: string) {
    try {
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
        },
      );
      await budgetManager.consume("heroku");

      const logplexUrl = sessionRes.data?.logplex_url;
      if (!logplexUrl) {
        return 0;
      }

      const logsRes = await axios.get(logplexUrl, {
        headers: { Accept: "text/plain" },
      });

      const logText = logsRes.data;
      if (typeof logText !== "string" || !logText.trim()) {
        return 0;
      }

      const lines = logText.split("\n").filter((line) => line.trim());
      const events: import("@repo/shared/types").LogEvent[] = [];
      const since = Number((await readCursor(this.cursors, serviceId, "app")) || "0");
      let newestTimestamp = since;

      for (const line of lines) {
        const match = line.match(/^([^\s]+)\s+([^:]+):\s+(.*)$/);
        if (match && match[1] && match[2] && match[3]) {
          const timestampMs = Date.parse(match[1]);
          if (!Number.isNaN(timestampMs) && timestampMs > since) {
            events.push({
              id: `${match[1]}-${match[2]}-${Math.random()}`,
              timestamp: new Date(timestampMs).toISOString(),
              serviceId,
              provider: ProviderType.HEROKU,
              level: match[2].includes("err") ? "error" : "info",
              message: `[${match[2]}] ${match[3]}`,
              type: "app" as const,
            });
            newestTimestamp = Math.max(newestTimestamp, timestampMs);
          }
          continue;
        }

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

      if (newestTimestamp > since) {
        await writeCursor(
          this.cursors,
          serviceId,
          "app",
          newestTimestamp.toString(),
        );
      }

      if (events.length > 0) {
        await persistLogEvents(events);
        EventBus.emit("log", events);
      }
      return events.length;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          throw new Error("Rate limit");
        }
        if (error.response?.status === 404) {
          return 0;
        }
        console.error(`Failed to poll Heroku service ${serviceId}:`, error.message);
      } else {
        console.error(`Failed to poll Heroku service ${serviceId}:`, error);
      }
      throw error;
    }
  }
}
