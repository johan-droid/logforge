import "./env.js";
import { eq } from "drizzle-orm";
import { db, initializeDatabase } from "./db/index.js";
import { credentials } from "./db/schema.js";
import { serviceSyncQueue, startServiceSyncWorker } from "./polling/queue.js";
import { syncServicesForCredential } from "./polling/ServiceSync.js";

await initializeDatabase();

startServiceSyncWorker(async (credentialId) => {
  const rows = await db
    .select()
    .from(credentials)
    .where(eq(credentials.id, credentialId));
  const credential = rows[0];
  if (credential) {
    await syncServicesForCredential(credential);
  }
});

await serviceSyncQueue.waitUntilReady();
console.log("LogForge worker started");
