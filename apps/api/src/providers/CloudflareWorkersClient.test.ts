import "../test-env.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { EventBus } from "../sse/EventBus.js";
import { resetDatabase, seedService } from "../test-helpers.js";
import { CloudflareWorkersClient } from "./CloudflareWorkersClient.js";

describe("CloudflareWorkersClient", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedService("my-worker", "cloudflare");
  });

  it("maps worker tail frames into log events", async () => {
    const payloads: unknown[] = [];
    const listener = (payload: unknown) => payloads.push(payload);
    EventBus.on("log", listener);

    try {
      const client = new CloudflareWorkersClient(
        "token",
        "acct",
        "my-worker",
        "my-worker",
      );
      await client.handleMessage(
        JSON.stringify({
          logs: [
            {
              message: ["Hello from worker"],
              level: "log",
              timestamp: 1750000000000,
            },
          ],
          exceptions: [],
          eventTimestamp: 1750000000000,
        }),
      );
      assert.equal(payloads.length, 1);
    } finally {
      EventBus.off("log", listener);
    }
  });
});
