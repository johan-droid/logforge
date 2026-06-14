import { Queue, Worker } from "bullmq";
import { createRedisClient } from "../redis.js";

const connection = createRedisClient();

export const serviceSyncQueue = new Queue("service-sync", { connection });

export function startServiceSyncWorker(
  processFn: (credentialId: string) => Promise<void>,
) {
  return new Worker(
    "service-sync",
    async (job: { data: { credentialId: string } }) => {
      await processFn(job.data.credentialId as string);
    },
    { connection },
  );
}
