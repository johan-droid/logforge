import axios from "axios";
import { BasePoller } from "./BasePoller.js";
import { EventBus } from "../sse/EventBus.js";
import { budgetManager } from "../polling/BudgetManager.js";

export class CloudflareClient extends BasePoller {
  private lastSeenDeploymentId = new Map<string, string>();

  constructor(token: string) {
    super("cloudflare", token);
  }

  async poll(serviceId: string): Promise<number> {
    await this.checkBudget();

    try {
      let accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      if (!accountId) {
        // List accounts and use the first one
        const accountsRes = await axios.get("https://api.cloudflare.com/client/v4/accounts", {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        const accounts = accountsRes.data?.result;
        if (Array.isArray(accounts) && accounts.length > 0) {
          accountId = accounts[0].id;
        }
      }

      if (!accountId) {
        throw new Error("Cloudflare account ID is required but could not be resolved");
      }

      // Fetch deployments for the pages project (serviceId is the project name)
      const res = await axios.get(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${serviceId}/deployments`,
        {
          headers: { Authorization: `Bearer ${this.token}` },
        }
      );

      await budgetManager.consume("cloudflare");

      const deployments = res.data?.result || [];
      const events: any[] = [];
      const lastId = this.lastSeenDeploymentId.get(serviceId);

      const sortedDeployments = [...deployments].reverse();
      let newestId = lastId;

      for (const dep of sortedDeployments) {
        if (!lastId || dep.id !== lastId) {
          events.push({
            id: dep.id,
            timestamp: dep.created_on || new Date().toISOString(),
            serviceId,
            provider: "cloudflare",
            level: dep.latest_stage?.status === "failure" ? "error" : "info",
            message: `Deployment ${dep.id} updated. Status: ${dep.latest_stage?.status || "unknown"}. Environment: ${dep.environment}. URL: ${dep.url}`,
          });
          newestId = dep.id;
        }
      }

      if (newestId) {
        this.lastSeenDeploymentId.set(serviceId, newestId);
      }

      if (events.length === 0 && !lastId) {
        if (deployments.length > 0) {
          this.lastSeenDeploymentId.set(serviceId, deployments[0].id);
        }
      }

      if (events.length > 0) {
        EventBus.emit("log", events);
      }
      return events.length;
    } catch (e) {
      console.error(`Failed to poll Cloudflare Pages project ${serviceId}:`, e);
      throw e;
    }
  }
}
