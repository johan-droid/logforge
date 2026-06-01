import axios from "axios";
import { BasePoller } from "./BasePoller.js";
import { EventBus } from "../sse/EventBus.js";
import { budgetManager } from "../polling/BudgetManager.js";

export class VercelClient extends BasePoller {
  private cursors = new Map<string, number>();

  constructor(token: string) {
    super("vercel", token);
  }

  async poll(serviceId: string): Promise<number> {
    await this.checkBudget();

    try {
      // 1. Get the latest deployment ID for the project
      // Note: serviceId is the Vercel projectId
      const deploymentsRes = await axios.get(
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

      // 2. Fetch runtime logs for this deployment
      const now = Date.now();
      const since = this.cursors.get(serviceId) || (now - 5 * 60 * 1000);

      const logsRes = await axios.get(
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

      const logs = rawLogs.map((log: any) => ({
        id: log.id || log.requestId || Math.random().toString(),
        timestamp: log.timestamp ? new Date(log.timestamp).toISOString() : new Date().toISOString(),
        serviceId,
        provider: "vercel",
        level: log.level || log.type || "info",
        message: log.message || log.text || JSON.stringify(log),
      }));

      let maxTimestamp = since;
      for (const log of rawLogs) {
        if (log.timestamp && log.timestamp > maxTimestamp) {
          maxTimestamp = log.timestamp;
        }
      }
      if (maxTimestamp > since) {
        this.cursors.set(serviceId, maxTimestamp + 1);
      }

      if (logs.length > 0) {
        EventBus.emit("log", logs);
      }
      return logs.length;
    } catch (e) {
      console.error(`Failed to poll Vercel service ${serviceId}:`, e);
      throw e;
    }
  }
}
