import { RATE_LIMITS } from "@repo/shared/constants";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { rateLimitState } from "../db/schema.js";
import { createRedisClient } from "../redis.js";

type BudgetState = {
  callsUsed: number;
  windowStart: Date;
  limitPerHr: number;
};

export class BudgetManager {
  private redis = createRedisClient();

  async getBudget(provider: string, scope = "global"): Promise<BudgetState> {
    const budgetKey = scope === "global" ? provider : `${provider}:${scope}`;
    const redisKey = `budget:${provider}:${scope}`;
    const cached = await this.redis.get(redisKey);
    if (cached) {
      const parsed = JSON.parse(cached) as {
        callsUsed: number;
        windowStart: string;
        limitPerHr: number;
      };
      return {
        callsUsed: parsed.callsUsed,
        windowStart: new Date(parsed.windowStart),
        limitPerHr: parsed.limitPerHr,
      };
    }

    const rows = await db
      .select()
      .from(rateLimitState)
      .where(eq(rateLimitState.provider, budgetKey));
    const row = rows[0];
    const limitPerHr =
      RATE_LIMITS[provider as keyof typeof RATE_LIMITS]?.callsPerHr || 1000;

    let state: BudgetState;
    if (row) {
      state = {
        callsUsed: row.callsUsed || 0,
        windowStart: row.windowStart,
        limitPerHr,
      };
    } else {
      state = {
        callsUsed: 0,
        windowStart: new Date(),
        limitPerHr,
      };
      await db.insert(rateLimitState).values({
        provider: budgetKey,
        callsUsed: 0,
        windowStart: state.windowStart,
        limitPerHr,
      });
    }

    const now = new Date();
    if (now.getTime() - state.windowStart.getTime() > 60 * 60 * 1000) {
      state.callsUsed = 0;
      state.windowStart = now;
      await this.saveState(budgetKey, state);
    } else {
      await this.cacheState(redisKey, state);
    }

    return state;
  }

  async consume(provider: string, count: number = 1, scope = "global") {
    const budgetKey = scope === "global" ? provider : `${provider}:${scope}`;
    const state = await this.getBudget(provider, scope);
    state.callsUsed += count;
    await this.saveState(budgetKey, state);
  }

  private async saveState(budgetKey: string, state: BudgetState) {
    await db
      .update(rateLimitState)
      .set({
        callsUsed: state.callsUsed,
        windowStart: state.windowStart,
        limitPerHr: state.limitPerHr,
      })
      .where(eq(rateLimitState.provider, budgetKey));

    const [provider, ...scopeParts] = budgetKey.split(":");
    await this.cacheState(`budget:${provider}:${scopeParts.join(":") || "global"}`, state);
  }

  private async cacheState(redisKey: string, state: BudgetState) {
    await this.redis.set(
      redisKey,
      JSON.stringify({
        callsUsed: state.callsUsed,
        windowStart: state.windowStart.toISOString(),
        limitPerHr: state.limitPerHr,
      }),
      "EX",
      5,
    );
  }
}

export const budgetManager = new BudgetManager();
