import { db } from "../db/index.js";
import { rateLimitState } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { RATE_LIMITS } from "@repo/shared/constants";

type BudgetState = {
  callsUsed: number;
  windowStart: Date;
  limitPerHr: number;
};

export class BudgetManager {
  private budgetCache = new Map<string, BudgetState>();

  async getBudget(provider: string, scope = "global"): Promise<BudgetState> {
    const budgetKey = scope === "global" ? provider : `${provider}:${scope}`;
    let state = this.budgetCache.get(budgetKey);

    if (!state) {
      const row = db
        .select()
        .from(rateLimitState)
        .where(eq(rateLimitState.provider, budgetKey))
        .get();
      const limitPerHr =
        RATE_LIMITS[provider as keyof typeof RATE_LIMITS]?.callsPerHr || 1000;

      if (row) {
        state = {
          callsUsed: row.callsUsed || 0,
          windowStart: row.windowStart,
          limitPerHr,
        };
      } else {
        state = { callsUsed: 0, windowStart: new Date(), limitPerHr };
        db.insert(rateLimitState)
          .values({
            provider: budgetKey,
            callsUsed: 0,
            windowStart: state.windowStart,
            limitPerHr,
          })
          .run();
      }
      this.budgetCache.set(budgetKey, state);
    }

    const now = new Date();
    if (now.getTime() - state.windowStart.getTime() > 60 * 60 * 1000) {
      state.callsUsed = 0;
      state.windowStart = now;
      this.saveState(budgetKey, state);
    }

    return state;
  }

  async consume(provider: string, count: number = 1, scope = "global") {
    const state = await this.getBudget(provider, scope);
    state.callsUsed += count;
    this.saveState(
      scope === "global" ? provider : `${provider}:${scope}`,
      state,
    );
  }

  private saveState(budgetKey: string, state: BudgetState) {
    db.update(rateLimitState)
      .set({
        callsUsed: state.callsUsed,
        windowStart: state.windowStart,
        limitPerHr: state.limitPerHr,
      })
      .where(eq(rateLimitState.provider, budgetKey))
      .run();
  }
}

export const budgetManager = new BudgetManager();
