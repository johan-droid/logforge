import "../test-env.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import axios from "axios";
import { resetDatabase, seedService } from "../test-helpers.js";
import { CloudflareClient } from "./CloudflareClient.js";

describe("CloudflareClient", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedService("page-site", "cloudflare");
  });

  it("maps pages deployments into app events", async () => {
    const originalGet = axios.get;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/accounts")) {
        return new Response(JSON.stringify({ result: [{ id: "acct_1" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    axios.get = (async () =>
      ({
        data: {
          result: [
            {
              id: "dep_1",
              created_on: "2026-06-14T10:00:00.000Z",
              latest_stage: { status: "success" },
              environment: "production",
              url: "https://page.example",
            },
          ],
        },
      }) as never) as typeof axios.get;

    try {
      const client = new CloudflareClient("cf-token");
      const count = await client.poll("page-site", "app", { serviceType: "pages" });
      assert.equal(count, 1);
    } finally {
      axios.get = originalGet;
      globalThis.fetch = originalFetch;
    }
  });
});
