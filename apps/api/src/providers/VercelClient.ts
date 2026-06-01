import axios from "axios";
import { BasePoller } from "./BasePoller.js";
import { EventBus } from "../sse/EventBus.js";
import { budgetManager } from "../polling/BudgetManager.js";

type VercelDeployment = {
  uid: string;
  created: number;
  state: string;
  url?: string;
};

type VercelEvent = {
  id: string;
  type: string;
  created?: number;
  payload?: {
    text?: string;
    [key: string]: unknown;
  };
};

type VercelRuntimeLog = {
  id?: string;
  requestId?: string;
  timestamp?: number | string;
  level?: string;
  type?: string;
  message?: string;
  text?: string;
  [key: string]: unknown;
};

export class VercelClient extends BasePoller {
  private cursors = new Map<string, number>();
  private deploymentCursors = new Map<string, string>();

  constructor(token: string) {
    super("vercel", token);
  }

  async poll(serviceId: string, logType: "app" | "build"): Promise<number> {
    await this.checkBudget();

    try {
      // 1. Get the latest deployment ID for the project
      const deploymentsRes = await axios.get<{ deployments: VercelDeployment[] }>(
        `https://api.vercel.com/v6/deployments?projectId=${serviceId}&limit=1`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
        }
      );

      await budgetManager.consume("vercel");

      const deployment = deploymentsRes.data?.deployments?.[0];
      if (!deployment?.uid) {
        return 0;
      }

      const deploymentId = deployment.uid;

      if (logType === "build") {
        const lastDeployId = this.deploymentCursors.get(`${serviceId}:build`);
        
        // Only fetch if new deployment
        if (lastDeployId === deploymentId) {
          return 0;
        }

        try {
          // Fetch deployment build events
          const cursorKey = `${serviceId}:build`;
          const since = this.cursors.get(cursorKey) || 0;
          
          const eventsRes = await axios.get<VercelEvent[]>(
            `https://api.vercel.com/v2/deployments/${deploymentId}/events`,
            {
              headers: { Authorization: `Bearer ${this.token}` },
              params: {
                since,
                direction: "forward",
              },
            }
          );
          await budgetManager.consume("vercel");

          const rawEvents = Array.isArray(eventsRes.data) ? eventsRes.data : [];
          
          if (rawEvents.length > 0) {
            const logs = rawEvents.map((evt) => ({
              id: evt.id || Math.random().toString(),
              timestamp: evt.created ? new Date(evt.created).toISOString() : new Date().toISOString(),
              serviceId,
              provider: "vercel" as const,
              level: evt.type === "error" ? "error" : "info",
              message: evt.payload?.text || JSON.stringify(evt),
              type: "build" as const,
            }));

            let maxCreated = since;
            for (const evt of rawEvents) {
              if (evt.created && evt.created > maxCreated) {
                maxCreated = evt.created;
              }
            }
            if (maxCreated > since) {
              this.cursors.set(cursorKey, maxCreated);
            }

            this.deploymentCursors.set(`${serviceId}:build`, deploymentId);
            EventBus.emit("log", logs);
            return logs.length;
          }
        } catch (err) {
          console.warn("Failed to fetch Vercel build events:", err);
        }

        // Fallback: emit deployment status
        const logs = [{
          id: `deploy-${deploymentId}-${Date.now()}`,
          timestamp: new Date(deployment.created).toISOString(),
          serviceId,
          provider: "vercel" as const,
          level: deployment.state === "ERROR" ? "error" : "info",
          message: `[deploy:${deploymentId}] Deployment state: ${deployment.state}${deployment.url ? ` URL: ${deployment.url}` : ''}`,
          type: "build" as const,
        }];

        this.deploymentCursors.set(`${serviceId}:build`, deploymentId);
        EventBus.emit("log", logs);
        return 1;
      }

      // 2. Fetch runtime logs for this deployment
      const cursorKey = `${serviceId}:app`;
      const now = Date.now();
      const since = this.cursors.get(cursorKey) || (now - 5 * 60 * 1000);

      const logsRes = await axios.get<{ logs?: VercelRuntimeLog[] }>(
        `https://api.vercel.com/v1/projects/${serviceId}/deployments/${deploymentId}/runtime-logs`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
          params: {
            since,
            limit: 100,
          },
        }
      );

      await budgetManager.consume("vercel");

      const rawLogs = Array.isArray(logsRes.data)
        ? logsRes.data
        : (logsRes.data?.logs || []);

      if (rawLogs.length === 0) {
        return 0;
      }

      const logs = rawLogs.map((log) => ({
        id: (log.id as string) || (log.requestId as string) || Math.random().toString(),
        timestamp: log.timestamp 
          ? (typeof log.timestamp === 'number' ? new Date(log.timestamp).toISOString() : log.timestamp)
          : new Date().toISOString(),
        serviceId,
        provider: "vercel" as const,
        level: (log.level as string) || (log.type as string) || "info",
        message: (log.message as string) || (log.text as string) || JSON.stringify(log),
        type: "app" as const,
      }));

      let maxTimestamp = since;
      for (const log of rawLogs) {
        const ts = typeof log.timestamp === 'number' ? log.timestamp : (log.timestamp ? Date.parse(log.timestamp) : 0);
        if (ts && ts > maxTimestamp) {
          maxTimestamp = ts;
        }
      }
      if (maxTimestamp > since) {
        this.cursors.set(cursorKey, maxTimestamp + 1);
      }

      if (logs.length > 0) {
        EventBus.emit("log", logs);
      }
      return logs.length;
    } catch (e) {
      if (axios.isAxiosError(e)) {
        if (e.response?.status === 429) {
          throw new Error("Rate limit");
        }
        if (e.response?.status === 404) {
          return 0;
        }
        console.error(`Failed to poll Vercel service ${serviceId}:`, e.message);
      } else {
        console.error(`Failed to poll Vercel service ${serviceId}:`, e);
      }
      throw e;
    }
  }
}
