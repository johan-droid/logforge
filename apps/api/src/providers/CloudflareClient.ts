import axios from "axios";
import { BasePoller } from "./BasePoller.js";
import { EventBus } from "../sse/EventBus.js";
import { budgetManager } from "../polling/BudgetManager.js";
import { ProviderType } from "@repo/shared/types";

type CloudflareDeployment = {
  id: string;
  created_on?: string;
  modified_on?: string;
  latest_stage?: {
    status?: string;
    name?: string;
  };
  environment?: string;
  url?: string;
  deployment_trigger?: {
    type?: string;
  };
};

type CloudflareDeploymentHistory = {
  id: string;
  name: string;
  status: string;
  started_on?: string;
  ended_on?: string;
  duration?: number;
  logs?: Array<{
    timestamp?: string;
    message?: string;
    level?: string;
  }>;
};

export class CloudflareClient extends BasePoller {
  private lastSeenDeploymentId = new Map<string, string>();
  private buildHistoryCursors = new Map<string, string>();

  constructor(token: string) {
    super("cloudflare", token);
  }

  async poll(serviceId: string, logType: "app" | "build"): Promise<number> {
    await this.checkBudget();

    // Get account ID first
    let accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!accountId) {
      try {
        const accountsRes = await axios.get("https://api.cloudflare.com/client/v4/accounts", {
          headers: { Authorization: `Bearer ${this.token}` },
          timeout: 10000,
        });
        const accounts = accountsRes.data?.result;
        if (Array.isArray(accounts) && accounts.length > 0) {
          accountId = accounts[0].id;
        }
      } catch (err) {
        console.warn("Failed to fetch Cloudflare account ID:", err);
        return 0;
      }
    }

    if (!accountId) {
      console.warn("Cloudflare account ID not available");
      return 0;
    }

    if (logType === "build") {
      try {
        // Fetch latest deployment for build info
        const res = await axios.get<{ result: CloudflareDeployment[] }>(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${serviceId}/deployments`,
          {
            headers: { Authorization: `Bearer ${this.token}` },
            params: { per_page: 1 },
          }
        );
        await budgetManager.consume("cloudflare");

        const latestDep = res.data?.result?.[0];
        if (!latestDep?.id) {
          return 0;
        }

        const lastDeployId = this.lastSeenDeploymentId.get(`${serviceId}:build`);
        if (lastDeployId === latestDep.id) {
          return 0;
        }

        const logs: Array<{
          id: string;
          timestamp: string;
          serviceId: string;
          provider: ProviderType;
          level: string;
          message: string;
          type: "build";
        }> = [];

        // Try to fetch deployment history/stages
        try {
          const historyRes = await axios.get<{ result: { stages?: CloudflareDeploymentHistory[] } }>(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${serviceId}/deployments/${latestDep.id}/history`,
            {
              headers: { Authorization: `Bearer ${this.token}` },
              timeout: 10000,
            }
          );
          await budgetManager.consume("cloudflare");

          const stages = historyRes.data?.result?.stages || [];
          const cursorKey = `${serviceId}:build:history`;
          const lastStageCount = parseInt(this.buildHistoryCursors.get(cursorKey) || "0");
          
          if (stages.length > lastStageCount) {
            const newStages = stages.slice(lastStageCount);
            for (const stage of newStages) {
              logs.push({
                id: `${latestDep.id}-${stage.name}-${Date.now()}`,
                timestamp: stage.started_on || new Date().toISOString(),
                serviceId,
                provider: ProviderType.CLOUDFLARE,
                level: stage.status === "failure" ? "error" : "info",
                message: `[stage:${stage.name}] Status: ${stage.status}${stage.duration ? `, Duration: ${stage.duration}s` : ''}`,
                type: "build",
              });
            }
            this.buildHistoryCursors.set(cursorKey, stages.length.toString());
          }
        } catch (err) {
          console.warn("Failed to fetch Cloudflare deployment history:", err);
        }

        // Always emit deployment status
        if (logs.length === 0) {
          logs.push({
            id: `deploy-${latestDep.id}-${Date.now()}`,
            timestamp: latestDep.created_on || new Date().toISOString(),
            serviceId,
            provider: ProviderType.CLOUDFLARE,
            level: latestDep.latest_stage?.status === "failure" ? "error" : "info",
            message: `[deploy:${latestDep.id}] Status: ${latestDep.latest_stage?.status || "unknown"}${latestDep.url ? `, URL: ${latestDep.url}` : ''}`,
            type: "build",
          });
        }

        this.lastSeenDeploymentId.set(`${serviceId}:build`, latestDep.id);
        
        if (logs.length > 0) {
          EventBus.emit("log", logs);
        }
        return logs.length;
      } catch (err) {
        console.warn("Failed to fetch Cloudflare Pages build logs:", err);
        return 0;
      }
    }

    // App/Runtime logs - track deployment changes
    try {
      const cursorKey = `${serviceId}:app`;
      
      // Fetch deployments for the pages project
      const res = await axios.get<{ result: CloudflareDeployment[] }>(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${serviceId}/deployments`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
          params: { per_page: 10 },
          timeout: 10000,
        }
      );

      await budgetManager.consume("cloudflare");

      const deployments = res.data?.result || [];
      const events: import("@repo/shared/types").LogEvent[] = [];
      const lastId = this.lastSeenDeploymentId.get(cursorKey);

      const sortedDeployments = [...deployments].reverse();
      let newestId = lastId;

      for (const dep of sortedDeployments) {
        if (!lastId || dep.id !== lastId) {
          events.push({
            id: dep.id,
            timestamp: dep.created_on || new Date().toISOString(),
            serviceId,
            provider: ProviderType.CLOUDFLARE,
            level: dep.latest_stage?.status === "failure" ? "error" : "info",
            message: `Deployment ${dep.id} updated. Status: ${dep.latest_stage?.status || "unknown"}. Environment: ${dep.environment || "production"}. URL: ${dep.url || "N/A"}`,
            type: "app" as const,
          });
          newestId = dep.id;
        }
      }

      if (newestId) {
        this.lastSeenDeploymentId.set(cursorKey, newestId);
      }

      if (events.length === 0 && !lastId && deployments.length > 0) {
        this.lastSeenDeploymentId.set(cursorKey, deployments[0].id);
      }

      if (events.length > 0) {
        EventBus.emit("log", events);
      }
      return events.length;
    } catch (e) {
      if (axios.isAxiosError(e)) {
        if (e.response?.status === 429) {
          throw new Error("Rate limit");
        }
        if (e.response?.status === 404) {
          return 0;
        }
        console.error(`Failed to poll Cloudflare Pages project ${serviceId}:`, e.message);
      } else {
        console.error(`Failed to poll Cloudflare Pages project ${serviceId}:`, e);
      }
      throw e;
    }
  }
}
