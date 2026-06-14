import { ProviderType } from "@repo/shared/types";
import type { PollContext } from "./BasePoller.js";
import { BasePoller } from "./BasePoller.js";
import { readCursor, writeCursor } from "./cursors.js";
import { persistLogEvents } from "./logPersistence.js";
import { railwayGraphQL } from "./railway-shared.js";
import { EventBus } from "../sse/EventBus.js";
import { budgetManager } from "../polling/BudgetManager.js";

export class RailwayClient extends BasePoller {
  private deploymentCursors = new Map<string, string>();
  private logCursors = new Map<string, string>();

  constructor(token: string) {
    super("railway", token);
  }

  async poll(
    serviceId: string,
    logType: "app" | "build",
    context?: PollContext,
  ): Promise<number> {
    await this.checkBudget();

    const deployment = await this.fetchLatestDeployment(serviceId, context);
    await budgetManager.consume("railway");
    if (!deployment?.id) {
      return 0;
    }

    if (logType === "build") {
      const cursorKey = `${serviceId}:build`;
      const lastDeployId =
        (await readCursor(this.deploymentCursors, serviceId, "build")) ||
        this.deploymentCursors.get(cursorKey);
      if (lastDeployId === deployment.id) {
        return 0;
      }

      const logsData = await railwayGraphQL<{
        buildLogs: Array<{ timestamp: string; message: string; severity?: string }>;
      }>(
        this.token,
        `query($deploymentId: String!) {
          buildLogs(deploymentId: $deploymentId, limit: 200) { timestamp message severity }
        }`,
        { deploymentId: deployment.id },
      );
      await budgetManager.consume("railway");

      const events = logsData.buildLogs.map((log) => ({
        id: `${deployment.id}-${log.timestamp}-${Math.random()}`,
        timestamp: log.timestamp,
        serviceId,
        provider: ProviderType.RAILWAY,
        level: log.severity?.toLowerCase() === "error" ? "error" : "info",
        message: log.message,
        type: "build" as const,
      }));

      await writeCursor(
        this.deploymentCursors,
        serviceId,
        "build",
        deployment.id,
      );
      if (events.length > 0) {
        await persistLogEvents(events);
        EventBus.emit("log", events);
      }
      return events.length;
    }

    const since = await readCursor(this.logCursors, serviceId, "app");
    const rawLogs = await this.fetchDeploymentLogs(deployment.id, since);
    await budgetManager.consume("railway");
    if (rawLogs.length === 0) {
      return 0;
    }

    const events = rawLogs.map((log) => ({
      id: `${deployment.id}-${log.timestamp}-${Math.random()}`,
      timestamp: log.timestamp,
      serviceId,
      provider: ProviderType.RAILWAY,
      level: log.severity?.toLowerCase() === "error" ? "error" : "info",
      message: log.message,
      type: "app" as const,
    }));

    const newest = rawLogs[rawLogs.length - 1];
    if (newest) {
      await writeCursor(this.logCursors, serviceId, "app", newest.timestamp);
    }

    await persistLogEvents(events);
    EventBus.emit("log", events);
    return events.length;
  }

  private async fetchLatestDeployment(
    serviceId: string,
    context?: PollContext,
  ) {
    try {
      const data = await railwayGraphQL<{
        deployments: {
          edges: Array<{
            node: {
              id: string;
              status: string;
              createdAt: string;
              staticUrl?: string;
            };
          }>;
        };
      }>(
        this.token,
        `query($serviceId: String!) {
          deployments(input: { serviceId: $serviceId }, first: 1) {
            edges { node { id status createdAt staticUrl } }
          }
        }`,
        { serviceId },
      );

      return data.deployments.edges[0]?.node;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!context?.providerProjectId || !message.includes("serviceId")) {
        throw error;
      }

      const data = await railwayGraphQL<{
        deployments: {
          edges: Array<{
            node: {
              id: string;
              status: string;
              createdAt: string;
              staticUrl?: string;
            };
          }>;
        };
      }>(
        this.token,
        `query($projectId: String!, $serviceId: String!) {
          deployments(input: { projectId: $projectId, serviceId: $serviceId }, first: 1) {
            edges { node { id status createdAt staticUrl } }
          }
        }`,
        { projectId: context.providerProjectId, serviceId },
      );

      return data.deployments.edges[0]?.node;
    }
  }

  private async fetchDeploymentLogs(deploymentId: string, since?: string) {
    try {
      const data = await railwayGraphQL<{
        deploymentLogs: Array<{ timestamp: string; message: string; severity?: string }>;
      }>(
        this.token,
        `query($deploymentId: String!, $startDate: DateTime) {
          deploymentLogs(deploymentId: $deploymentId, limit: 200, startDate: $startDate) {
            timestamp message severity
          }
        }`,
        { deploymentId, startDate: since },
      );
      return data.deploymentLogs || [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("startDate")) {
        throw error;
      }

      const data = await railwayGraphQL<{
        deploymentLogs: Array<{ timestamp: string; message: string; severity?: string }>;
      }>(
        this.token,
        `query($deploymentId: String!) {
          deploymentLogs(deploymentId: $deploymentId, limit: 200) {
            timestamp message severity
          }
        }`,
        { deploymentId },
      );

      return (data.deploymentLogs || []).filter(
        (log) => !since || log.timestamp > since,
      );
    }
  }
}
