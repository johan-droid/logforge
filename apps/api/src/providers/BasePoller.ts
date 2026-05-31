import { budgetManager } from "../polling/BudgetManager.js";

export abstract class BasePoller {
  constructor(
    protected provider: string,
    protected token: string,
  ) {}

  abstract poll(serviceId: string): Promise<void>;

  protected async checkBudget() {
    const budget = await budgetManager.getBudget(this.provider);
    if (budget.callsUsed > budget.limitPerHr * 0.9) {
      throw new Error(`Rate limit near exhaustion for ${this.provider}`);
    }
  }
}
