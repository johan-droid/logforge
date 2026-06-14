import { Queue, Worker } from "bullmq";
import { createRedisClient, isRedisConfigured } from "../redis.js";

type RepeatableJob = { id?: string; key: string };

type ServiceSyncQueueLike = {
  add: (
    name: string,
    data: { credentialId: string },
    options: { repeat: { every: number }; jobId: string },
  ) => Promise<void>;
  getRepeatableJobs: () => Promise<RepeatableJob[]>;
  removeRepeatableByKey: (key: string) => Promise<void>;
  waitUntilReady: () => Promise<void>;
};

const connection = isRedisConfigured() ? createRedisClient() : null;

export const serviceSyncQueue: ServiceSyncQueueLike = connection
  ? new Queue("service-sync", { connection })
  : {
      async add() {},
      async getRepeatableJobs() {
        return [];
      },
      async removeRepeatableByKey() {},
      async waitUntilReady() {},
    };

export function startServiceSyncWorker(
  processFn: (credentialId: string) => Promise<void>,
) {
  if (!connection) {
    return null;
  }

  return new Worker(
    "service-sync",
    async (job: { data: { credentialId: string } }) => {
      await processFn(job.data.credentialId as string);
    },
    { connection },
  );
}
