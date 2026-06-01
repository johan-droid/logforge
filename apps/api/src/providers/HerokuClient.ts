import axios from "axios";
import { BasePoller } from "./BasePoller.js";
import { EventBus } from "../sse/EventBus.js";
import { budgetManager } from "../polling/BudgetManager.js";

export class HerokuClient extends BasePoller {
  private lastLogTimestamp = new Map<string, number>();

  constructor(token: string) {
    super("heroku", token);
  }

  async poll(serviceId: string): Promise<number> {
    await this.checkBudget();

    try {
      // 1. Create a log session
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

      // 2. Fetch logs from logplexUrl (returns plain text)
      const logsRes = await axios.get(logplexUrl, {
        headers: { Accept: "text/plain" },
      });

      const logText = logsRes.data;
      if (typeof logText !== "string" || !logText.trim()) {
        return 0;
      }

      const lines = logText.split("\n").filter((line) => line.trim());
      const events: any[] = [];
      const since = this.lastLogTimestamp.get(serviceId) || 0;
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
                provider: "heroku",
                level: source.includes("err") ? "error" : "info",
                message: `[${source}] ${message}`,
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
              provider: "heroku",
              level: "info",
              message: line,
            });
          }
        } else {
          events.push({
            id: Math.random().toString(),
            timestamp: new Date().toISOString(),
            serviceId,
            provider: "heroku",
            level: "info",
            message: line,
          });
        }
      }

      if (newestTimestamp > since) {
        this.lastLogTimestamp.set(serviceId, newestTimestamp);
      }

      if (events.length > 0) {
        EventBus.emit("log", events);
      }
      return events.length;
    } catch (e) {
      console.error(`Failed to poll Heroku service ${serviceId}:`, e);
      throw e;
    }
  }
}
