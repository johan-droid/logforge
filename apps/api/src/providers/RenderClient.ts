import axios from "axios";
import { BasePoller } from "./BasePoller.js";
import { EventBus } from "../sse/EventBus.js";
import { budgetManager } from "../polling/BudgetManager.js";

type RenderLogEntry = {
  id: string;
  message: string;
  timestamp: string;
  labels?: Array<{ name: string; value: string }>;
};

type RenderLogsResponse = {
  logs?: RenderLogEntry[];
};

export class RenderClient extends BasePoller {
  private cursors = new Map<string, string>();

  constructor(token: string) {
    super("render", token);
  }

  async poll(serviceId: string): Promise<number> {
    await this.checkBudget();
    const ownerId = process.env.RENDER_OWNER_ID;

    if (!ownerId) {
      throw new Error("RENDER_OWNER_ID is required to query Render logs");
    }

    try {
      const now = new Date();
      const startTime =
        this.cursors.get(serviceId) ||
        new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      const params = new URLSearchParams({
        ownerId,
        startTime,
        endTime: now.toISOString(),
        direction: "forward",
        limit: "100",
      });
      params.append("resource", serviceId);

      const res = await axios.get<RenderLogsResponse>(
        `https://api.render.com/v1/logs?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
        },
      );

      await budgetManager.consume("render");

      const logs = (res.data.logs || []).map((log) => ({
        id: log.id,
        timestamp: log.timestamp,
        serviceId,
        provider: "render",
        level: log.labels?.find((label) => label.name === "level")?.value,
        message: log.message,
      }));

      const newestLog = logs[logs.length - 1];
      if (newestLog) {
        this.cursors.set(
          serviceId,
          new Date(new Date(newestLog.timestamp).getTime() + 1).toISOString(),
        );
      }

      if (logs.length > 0) {
        EventBus.emit("log", logs);
      }
      return logs.length;
    } catch (e) {
      console.error(`Failed to poll Render service ${serviceId}:`, e);
      throw e;
    }
  }
}
