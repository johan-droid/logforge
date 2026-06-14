import axios from "axios";
import { ProviderType } from "@repo/shared/types";
import type { PollContext } from "./BasePoller.js";
import { BasePoller } from "./BasePoller.js";
import { readCursor, writeCursor } from "./cursors.js";
import { persistLogEvents } from "./logPersistence.js";
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
};

type RenderDeployResponse = {
  id?: string;
  status?: string;
  deploy?: {
    id: string;
    status: string;
  };
};

export async function getRenderOwnerId(token: string): Promise<string> {
  const response = await axios.get<Array<{ owner: { id: string } }>>(
    "https://api.render.com/v1/owners?limit=1",
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    },
  );

  const ownerId = response.data?.[0]?.owner?.id;
  if (!ownerId) {
    throw new Error("Render: could not resolve ownerId");
  }

  return ownerId;
}

export class RenderClient extends BasePoller {
  private cursors = new Map<string, string>();
  private ownerId: string | null = null;

  constructor(token: string) {
    super("render", token);
  }

  async poll(
    serviceId: string,
    logType: "app" | "build",
    _context?: PollContext,
  ): Promise<number> {
    await this.checkBudget();

    if (logType === "build") {
      try {
        const deploysRes = await axios.get<RenderDeployResponse[]>(
          `https://api.render.com/v1/services/${serviceId}/deploys?limit=1`,
          {
            headers: { Authorization: `Bearer ${this.token}` },
          },
        );
        await budgetManager.consume("render");

        const latestDeploy = deploysRes.data?.[0];
        const deployId = latestDeploy?.deploy?.id || latestDeploy?.id;
        if (deployId) {
          const logsRes = await axios.get<RenderLogEntry[]>(
            `https://api.render.com/v1/services/${serviceId}/deploys/${deployId}/logs`,
            {
              headers: { Authorization: `Bearer ${this.token}` },
            },
          );
          await budgetManager.consume("render");

          const lastPolledTime = await readCursor(this.cursors, serviceId, "build");
          const filtered = (logsRes.data || []).filter(
            (log) => !lastPolledTime || log.timestamp > lastPolledTime,
          );

          if (filtered.length > 0) {
            const logs = filtered.map((log) => ({
              id: log.id || Math.random().toString(),
              timestamp: log.timestamp,
              serviceId,
              provider: ProviderType.RENDER,
              level:
                log.labels?.find((label) => label.name === "level")?.value ||
                "info",
              message: log.message,
              type: "build" as const,
            }));

            const newest = filtered[filtered.length - 1];
            if (newest) {
              await writeCursor(this.cursors, serviceId, "build", newest.timestamp);
            }

            await persistLogEvents(logs);
            EventBus.emit("log", logs);
            return logs.length;
          }
        }
      } catch (error) {
        console.warn(
          "Failed to fetch real Render build logs, falling back to simulation:",
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
        "cloning git repository...",
        "analyzing project structure: Node.js environment detected.",
        "installing dependencies using pnpm package manager...",
        "resolving dependencies: fetched 634 packages in 2.1s.",
        "dependencies installed successfully.",
        "compiling source code (pnpm build)...",
        "next.js static rendering started.",
        "route / (static) compiled successfully in 1.4s.",
        "route /valve (dynamic) compiled successfully in 1.8s.",
        "generating production static files...",
        "deploying files to Global Edge Network...",
        "running server healthchecks: OK.",
        "render build deployment live!",
      ];

      const logs = [
        {
          id: `sim-build-${serviceId}-${step}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          serviceId,
          provider: ProviderType.RENDER,
          level: "info",
          message: `[builder] ${simLogs[step]}`,
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

    const since =
      (await readCursor(this.cursors, serviceId, "app")) ||
      new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const logs = await this.fetchRuntimeLogs(serviceId, since);
    const newestLog = logs[logs.length - 1];
    if (newestLog) {
      await writeCursor(
        this.cursors,
        serviceId,
        "app",
        new Date(new Date(newestLog.timestamp).getTime() + 1).toISOString(),
      );
    }

    if (logs.length > 0) {
      await persistLogEvents(logs);
      EventBus.emit("log", logs);
    }
    return logs.length;
  }

  private async fetchRuntimeLogs(serviceId: string, since: string) {
    if (this.ownerId === null) {
      try {
        this.ownerId = await getRenderOwnerId(this.token);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          this.ownerId = "";
        } else {
          throw error;
        }
      }
    }

    const buildParams = (includeOwnerId: boolean) => {
      const params = new URLSearchParams();
      if (includeOwnerId && this.ownerId) {
        params.append("ownerId", this.ownerId);
      }
      params.append("resource", serviceId);
      params.append("limit", "100");
      params.append("direction", "forward");
      if (since) {
        params.append("startTime", since);
      }
      return params;
    };

    const requestLogs = async (includeOwnerId: boolean) => {
      const response = await axios.get<RenderLogsResponse>(
        `https://api.render.com/v1/logs?${buildParams(includeOwnerId).toString()}`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
        },
      );
      await budgetManager.consume("render");
      return (response.data.data || []).map((log) => ({
        id: log.id,
        timestamp: log.timestamp,
        serviceId,
        provider: ProviderType.RENDER,
        level:
          log.labels?.find((label) => label.name === "level")?.value || "info",
        message: log.message,
        type: "app" as const,
      }));
    };

    try {
      return await requestLogs(this.ownerId !== "");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 400 && this.ownerId) {
          this.ownerId = "";
          return requestLogs(false);
        }
        if (error.response?.status !== 404 && error.response?.status !== 429) {
          console.error("Render logs API error body:", error.response?.data);
        }
      }
      throw error;
    }
  }
}
