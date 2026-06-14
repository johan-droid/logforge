import { budgetManager } from "../polling/BudgetManager.js";

export type PollContext = {
  providerProjectId?: string | null;
  serviceType?: string | null;
};

export abstract class BasePoller {
  constructor(
    protected provider: string,
    protected token: string,
  ) {}

  abstract poll(
    serviceId: string,
    logType: "app" | "build",
    context?: PollContext,
  ): Promise<number>;

  protected async checkBudget() {
    const budget = await budgetManager.getBudget(this.provider);
    if (budget.callsUsed > budget.limitPerHr * 0.9) {
      throw new Error(`Rate limit near exhaustion for ${this.provider}`);
    }
  }
}
