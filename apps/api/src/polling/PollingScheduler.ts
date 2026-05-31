import cron from "node-cron";

export class PollingScheduler {
  private jobs = new Map<string, cron.ScheduledTask>();

  startPolling(
    provider: string,
    credentialId: string,
    intervalMs: number,
    pollFunction: () => Promise<void>,
  ) {
    const jobId = `${provider}_${credentialId}`;
    if (this.jobs.has(jobId)) {
      this.jobs.get(jobId)!.stop();
    }

    const intervalSeconds = Math.max(1, Math.floor(intervalMs / 1000));

    const task = cron.schedule(`*/${intervalSeconds} * * * * *`, async () => {
      try {
        await pollFunction();
      } catch (e) {
        console.error(`Error polling ${jobId}:`, e);
      }
    });

    this.jobs.set(jobId, task);
  }

  stopPolling(provider: string, credentialId: string) {
    const jobId = `${provider}_${credentialId}`;
    if (this.jobs.has(jobId)) {
      this.jobs.get(jobId)!.stop();
      this.jobs.delete(jobId);
    }
  }
}

export const pollingScheduler = new PollingScheduler();
