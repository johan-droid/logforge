import cron from "node-cron";
import { lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { logs } from "../db/schema.js";

export function startLogCleanupJob() {
  cron.schedule("0 0 * * *", async () => {
    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
    await db.delete(logs).where(lt(logs.timestamp, sixMonthsAgo));
    console.log("Log cleanup job ran");
  });
}
