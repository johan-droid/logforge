import "../test-env.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import axios from "axios";
import { resetDatabase, seedService } from "../test-helpers.js";
import { RenderClient } from "./RenderClient.js";

describe("RenderClient", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedService("srv-render", "render");
  });

  it("includes ownerId when fetching runtime logs", async () => {
    const originalGet = axios.get;
    const calls: string[] = [];

    axios.get = (async (url: string) => {
      calls.push(url);
      if (url.includes("/owners")) {
        return { data: [{ owner: { id: "usr-abc123" } }] } as never;
      }
      return {
        data: {
          data: [
            {
              id: "log_1",
              timestamp: "2026-06-14T10:00:00Z",
              message: "Listening on port 10000",
              labels: [{ name: "level", value: "info" }],
            },
          ],
        },
      } as never;
    }) as typeof axios.get;

    try {
      const client = new RenderClient("render-token");
      const count = await client.poll("srv-render", "app");
      assert.equal(count, 1);
      assert.ok(calls.some((url) => url.includes("ownerId=usr-abc123")));
    } finally {
      axios.get = originalGet;
    }
  });
});
