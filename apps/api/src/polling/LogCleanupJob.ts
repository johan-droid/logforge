import cron from "node-cron";
import { db } from "../db/index.js";
import { logs } from "../db/schema.js";
import { lt } from "drizzle-orm";

export function startLogCleanupJob() {
  cron.schedule("0 0 * * *", () => {
    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
    db.delete(logs).where(lt(logs.timestamp, sixMonthsAgo)).run();
    console.log("Log cleanup job ran");
  });
}
