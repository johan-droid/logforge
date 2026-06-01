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
  data?: RenderLogEntry[];
  pagination?: {
    next?: string;
  };
};

type RenderDeployResponse = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  image?: {
    url?: string;
  };
};

export class RenderClient extends BasePoller {
  private cursors = new Map<string, string>();
  private deployCursors = new Map<string, string>();

  constructor(token: string) {
    super("render", token);
  }

  async poll(serviceId: string, logType: "app" | "build"): Promise<number> {
    await this.checkBudget();

    if (logType === "build") {
      try {
        // Fetch latest deploy for build logs
        const deploysRes = await axios.get<RenderDeployResponse[]>(
          `https://api.render.com/v1/services/${serviceId}/deploys?limit=1&state=successful`,
          {
            headers: { Authorization: `Bearer ${this.token}` },
          }
        );
        await budgetManager.consume("render");

        const latestDeploy = deploysRes.data?.[0];
        if (!latestDeploy?.id) {
          return 0;
        }

        const deployId = latestDeploy.id;
        const lastDeployId = this.deployCursors.get(`${serviceId}:build`);
        
        // Only fetch logs if this is a new deploy
        if (lastDeployId === deployId) {
          return 0;
        }

        // Generate build log events based on deploy status
        const logs: Array<{
          id: string;
          timestamp: string;
          serviceId: string;
          provider: "render";
          level: string;
          message: string;
          type: "build";
        }> = [];

        // Generate build log events based on deploy status
        const statusMessages: Record<string, string> = {
          creating: "Creating new deployment...",
          building: "Building application...",
          built: "Build completed successfully",
          deploying: "Deploying to edge network...",
          live: "Deployment is now live",
          failed: "Deployment failed",
        };

        const statusMessage = statusMessages[latestDeploy.status] || `Deploy status: ${latestDeploy.status}`;
        
        logs.push({
          id: `deploy-${deployId}-${Date.now()}`,
          timestamp: latestDeploy.updatedAt,
          serviceId,
          provider: "render",
          level: latestDeploy.status === "failed" ? "error" : "info",
          message: `[deploy:${deployId}] ${statusMessage}`,
          type: "build",
        });

        this.deployCursors.set(`${serviceId}:build`, deployId);
        
        if (logs.length > 0) {
          EventBus.emit("log", logs);
        }
        return logs.length;
      } catch (err) {
        console.warn("Failed to fetch Render deploy status:", err);
        return 0;
      }
    }

    // App/Runtime logs using Render's log streaming endpoint
    try {
      const cursorKey = `${serviceId}:app`;
      const since = this.cursors.get(cursorKey);
      
      // Use Render's log endpoint with proper parameters
      const params = new URLSearchParams({
        resource: serviceId,
        limit: "100",
        direction: "forward",
      });

      if (since) {
        params.append("startTime", since);
      }

      const res = await axios.get<RenderLogsResponse>(
        `https://api.render.com/v1/logs?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
          timeout: 10000,
        },
      );

      await budgetManager.consume("render");

      const rawLogs = res.data?.data || [];
      
      if (rawLogs.length === 0) {
        return 0;
      }

      const logs = rawLogs.map((log) => ({
        id: log.id || `${log.timestamp}-${Math.random()}`,
        timestamp: log.timestamp,
        serviceId,
        provider: "render" as const,
        level: log.labels?.find((label) => label.name === "level")?.value || "info",
        message: log.message,
        type: "app" as const,
      }));

      const newestLog = logs[logs.length - 1];
      if (newestLog) {
        this.cursors.set(
          cursorKey,
          new Date(new Date(newestLog.timestamp).getTime() + 1).toISOString(),
        );
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
        console.error(`Failed to poll Render service ${serviceId}:`, e.message);
      } else {
        console.error(`Failed to poll Render service ${serviceId}:`, e);
      }
      throw e;
    }
  }
}
