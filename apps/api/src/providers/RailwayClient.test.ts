import "../test-env.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { EventBus } from "../sse/EventBus.js";
import { resetDatabase, seedService } from "../test-helpers.js";
import { RailwayClient } from "./RailwayClient.js";

describe("RailwayClient", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedService("svc_railway", "railway");
  });

  it("streams deployment logs and persists them", async () => {
    const originalFetch = globalThis.fetch;
    const events: unknown[] = [];
    const listener = (payload: unknown) => events.push(payload);
    EventBus.on("log", listener);

    globalThis.fetch = (async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes("deployments")) {
        return new Response(
          JSON.stringify({
            data: {
              deployments: {
                edges: [{ node: { id: "dep_1", status: "SUCCESS", createdAt: "2026-06-14T10:00:00.000Z" } }],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            deploymentLogs: [
              {
                timestamp: "2026-06-14T10:00:00.000Z",
                message: "Server listening on :8080",
                severity: "info",
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const client = new RailwayClient("railway-token");
      const count = await client.poll("svc_railway", "app");
      assert.equal(count, 1);
      assert.equal(events.length, 1);
    } finally {
      EventBus.off("log", listener);
      globalThis.fetch = originalFetch;
    }
  });
});
