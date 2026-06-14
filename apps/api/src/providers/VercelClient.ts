import axios from "axios";
import { ProviderType } from "@repo/shared/types";
import type { PollContext } from "./BasePoller.js";
import { BasePoller } from "./BasePoller.js";
import { readCursor, writeCursor } from "./cursors.js";
import { persistLogEvents } from "./logPersistence.js";
import { EventBus } from "../sse/EventBus.js";
import { budgetManager } from "../polling/BudgetManager.js";

type VercelEvent = {
  id?: string;
  type?: string;
  created?: number;
  payload?: { text?: string };
};

export class VercelClient extends BasePoller {
  private cursors = new Map<string, string>();
  private emittedRetentionNotice = new Set<string>();

  constructor(token: string) {
    super("vercel", token);
  }

  async poll(
    serviceId: string,
    logType: "app" | "build",
    _context?: PollContext,
  ): Promise<number> {
    await this.checkBudget();

    try {
      const deploymentsRes = await axios.get(
        `https://api.vercel.com/v6/deployments?projectId=${serviceId}&limit=1`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
        },
      );
      await budgetManager.consume("vercel");

      const deployment = deploymentsRes.data?.deployments?.[0];
      if (!deployment?.uid) {
        return 0;
      }

      const deploymentId = deployment.uid;
      const events = await this.fetchDeploymentEvents(serviceId, deploymentId, logType);
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
        console.error(`Failed to poll Vercel service ${serviceId}:`, error.message);
      } else {
        console.error(`Failed to poll Vercel service ${serviceId}:`, error);
      }
      throw error;
    }
  }

  private async fetchDeploymentEvents(
    serviceId: string,
    deploymentId: string,
    logType: "app" | "build",
  ) {
    const cursorKey = `${serviceId}:${logType}`;
    const since = Number(
      (await readCursor(this.cursors, serviceId, logType)) ||
        Date.now() - 5 * 60 * 1000,
    );

    let rawEvents: VercelEvent[] = [];
    try {
      rawEvents = await this.requestEvents("v2", deploymentId, since);
    } catch (error) {
      if (!(axios.isAxiosError(error) && error.response?.status === 404)) {
        throw error;
      }
      rawEvents = await this.requestEvents("v3", deploymentId, since);
    }

    if (rawEvents.length === 0) {
      if (logType === "app" && !this.emittedRetentionNotice.has(cursorKey)) {
        this.emittedRetentionNotice.add(cursorKey);
        return [
          {
            id: `vercel-retention-${serviceId}-${Date.now()}`,
            timestamp: new Date().toISOString(),
            serviceId,
            provider: ProviderType.VERCEL,
            level: "info",
            message:
              "No runtime events in Vercel's retention window for this deployment. Vercel only exposes recent deployment events via the public API; configure a Vercel Log Drain for continuous runtime log capture.",
            type: "app" as const,
          },
        ];
      }
      return [];
    }

    const logs = rawEvents.map((event) => ({
      id: event.id || Math.random().toString(),
      timestamp: event.created
        ? new Date(event.created).toISOString()
        : new Date().toISOString(),
      serviceId,
      provider: ProviderType.VERCEL,
      level: event.type === "error" || event.type === "stderr" ? "error" : "info",
      message: event.payload?.text || JSON.stringify(event),
      type: logType,
    }));

    let maxCreated = since;
    for (const event of rawEvents) {
      if (event.created && event.created > maxCreated) {
        maxCreated = event.created;
      }
    }
    if (maxCreated > since) {
      await writeCursor(this.cursors, serviceId, logType, maxCreated.toString());
    }

    return logs;
  }

  private async requestEvents(
    version: "v2" | "v3",
    deploymentId: string,
    since: number,
  ) {
    const response = await axios.get<VercelEvent[]>(
      `https://api.vercel.com/${version}/deployments/${deploymentId}/events`,
      {
        headers: { Authorization: `Bearer ${this.token}` },
        params: {
          since,
          direction: "forward",
          limit: 100,
        },
      },
    );
    await budgetManager.consume("vercel");
    return Array.isArray(response.data) ? response.data : [];
  }
}
