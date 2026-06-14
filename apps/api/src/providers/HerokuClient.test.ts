import "../test-env.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import axios from "axios";
import { resetDatabase, seedService } from "../test-helpers.js";
import { HerokuClient } from "./HerokuClient.js";

describe("HerokuClient", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedService("app-heroku", "heroku");
  });

  it("parses runtime logplex lines into events", async () => {
    const originalPost = axios.post;
    const originalGet = axios.get;

    axios.post = (async () =>
      ({ data: { logplex_url: "https://logplex.example" } }) as never) as typeof axios.post;
    axios.get = (async (url: string) => {
      if (url === "https://logplex.example") {
        return {
          data: "2026-06-14T10:00:00.000Z app[web.1]: hello world\n",
        } as never;
      }
      return { data: [] } as never;
    }) as typeof axios.get;

    try {
      const client = new HerokuClient("heroku-token");
      const count = await client.poll("app-heroku", "app");
      assert.equal(count, 1);
    } finally {
      axios.post = originalPost;
      axios.get = originalGet;
    }
  });
});
