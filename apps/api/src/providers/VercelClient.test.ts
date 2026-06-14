import "../test-env.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import axios from "axios";
import { resetDatabase, seedService } from "../test-helpers.js";
import { VercelClient } from "./VercelClient.js";

describe("VercelClient", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedService("prj_vercel", "vercel");
  });

  it("emits a retention notice when deployment events are empty", async () => {
    const originalGet = axios.get;
    axios.get = (async (url: string) => {
      if (url.includes("/v6/deployments")) {
        return { data: { deployments: [{ uid: "dep_vercel" }] } } as never;
      }
      return { data: [] } as never;
    }) as typeof axios.get;

    try {
      const client = new VercelClient("vercel-token");
      const count = await client.poll("prj_vercel", "app");
      assert.equal(count, 1);
    } finally {
      axios.get = originalGet;
    }
  });
});
