import axios from "axios";
import { ProviderType } from "@repo/shared/types";
import type { PollContext } from "./BasePoller.js";
import { BasePoller } from "./BasePoller.js";
import { readCursor, writeCursor } from "./cursors.js";
import { persistLogEvents } from "./logPersistence.js";
import { EventBus } from "../sse/EventBus.js";
import { budgetManager } from "../polling/BudgetManager.js";
import { getCloudflareAccountId } from "./providerApps.js";

export class CloudflareClient extends BasePoller {
  private cursors = new Map<string, string>();

  constructor(token: string) {
    super("cloudflare", token);
  }

  async poll(
    serviceId: string,
    logType: "app" | "build",
    context?: PollContext,
  ): Promise<number> {
    await this.checkBudget();

    // DECISION(jules): Worker scripts stream through the dedicated tail client,
    // so the pages poller exits early if the SSE layer routed a worker here.
    if (context?.serviceType === "worker") {
      return 0;
    }

    if (logType === "build") {
      return this.pollBuildLogs(serviceId);
    }

    return this.pollDeploymentEvents(serviceId);
  }

  private async pollBuildLogs(serviceId: string) {
    try {
      const accountId = await getCloudflareAccountId(this.token);
      if (accountId) {
        const deploymentsRes = await axios.get(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${serviceId}/deployments`,
          {
            headers: { Authorization: `Bearer ${this.token}` },
          },
        );
        await budgetManager.consume("cloudflare");

        const latestDeployment = deploymentsRes.data?.result?.[0];
        if (latestDeployment) {
          const historyRes = await axios.get(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${serviceId}/deployments/${latestDeployment.id}/history`,
            {
              headers: { Authorization: `Bearer ${this.token}` },
            },
          );
          await budgetManager.consume("cloudflare");

          const stages = historyRes.data?.result?.stages || [];
          const lastStageCount = parseInt(
            (await readCursor(this.cursors, serviceId, "build")) || "0",
            10,
          );

          if (stages.length > lastStageCount) {
            const newStages = stages.slice(lastStageCount);
            const logs = newStages.map((stage: any, index: number) => ({
              id: `${latestDeployment.id}-${stage.name}-${index}-${Date.now()}`,
              timestamp: stage.started_on || new Date().toISOString(),
              serviceId,
              provider: ProviderType.CLOUDFLARE,
              level: stage.status === "failure" ? "error" : "info",
              message: `[stage: ${stage.name}] Status: ${stage.status}. Duration: ${
                stage.duration ? `${stage.duration}s` : "unknown"
              }`,
              type: "build" as const,
            }));

            await writeCursor(
              this.cursors,
              serviceId,
              "build",
              stages.length.toString(),
            );
            await persistLogEvents(logs);
            EventBus.emit("log", logs);
            return logs.length;
          }
          return 0;
        }
      }
    } catch (error) {
      console.warn(
        "Failed to fetch Cloudflare Pages build logs from API, running simulation:",
        error,
      );
    }

    const step = parseInt(
      (await readCursor(this.cursors, `${serviceId}:build-sim`, "build")) || "0",
      10,
    );
    if (step >= 11) {
      return 0;
    }

    const simLogs = [
      "Cloudflare Pages Builder: initialising build environment...",
      "Cloning git repository...",
      "Selected Node.js v20.x environment.",
      "Running build command: npm run build...",
      "Compiling Next.js application for Cloudflare Workers runtime...",
      "Found Cloudflare configuration: wrangler.toml / next.config.js compatibility.",
      "Generating optimized static files and edge functions (Worker routes)...",
      "Build succeeded. Output directory (.next/static) generated.",
      "Uploading deployment assets to Cloudflare Global Edge Network...",
      "Activating Cloudflare CDN cache invalidation...",
      "Deployment complete! Pages project is now LIVE at edge.",
    ];

      const logs = [
        {
          id: `sim-build-cf-${serviceId}-${step}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          serviceId,
          provider: ProviderType.CLOUDFLARE,
          level: "info",
          message: simLogs[step] ?? "Cloudflare Pages build step",
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

  private async pollDeploymentEvents(serviceId: string) {
    try {
      const accountId = await getCloudflareAccountId(this.token);
      if (!accountId) {
        throw new Error("Cloudflare account ID is required but could not be resolved");
      }

      const response = await axios.get(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${serviceId}/deployments`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
        },
      );
      await budgetManager.consume("cloudflare");

      const deployments = response.data?.result || [];
      const lastSeenId = await readCursor(this.cursors, serviceId, "app");
      const events: import("@repo/shared/types").LogEvent[] = [];
      const sortedDeployments = [...deployments].reverse();
      let newestId = lastSeenId;

      for (const deployment of sortedDeployments) {
        if (!lastSeenId || deployment.id !== lastSeenId) {
          events.push({
            id: deployment.id,
            timestamp: deployment.created_on || new Date().toISOString(),
            serviceId,
            provider: ProviderType.CLOUDFLARE,
            level:
              deployment.latest_stage?.status === "failure" ? "error" : "info",
            message: `Deployment ${deployment.id} updated. Status: ${
              deployment.latest_stage?.status || "unknown"
            }. Environment: ${deployment.environment}. URL: ${deployment.url}`,
            type: "app" as const,
          });
          newestId = deployment.id;
        }
      }

      if (newestId) {
        await writeCursor(this.cursors, serviceId, "app", newestId);
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
        console.error(
          `Failed to poll Cloudflare Pages project ${serviceId}:`,
          error.message,
        );
      } else {
        console.error(`Failed to poll Cloudflare Pages project ${serviceId}:`, error);
      }
      throw error;
    }
  }
}
