import "../test-env.js";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { listProviderApps, validateProviderToken } from "./providerApps.js";

const originalFetch = globalThis.fetch;

describe("providerApps", () => {
  beforeEach(() => {
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("user/tokens/verify")) {
        return new Response("{}", { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("validates Railway tokens via GraphQL", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: { me: { id: "usr_abc123" } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    const valid = await validateProviderToken("railway", "railway-token");
    assert.equal(valid, true);
  });

  it("maps Railway projects and services into provider apps", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: {
            me: {
              projects: {
                edges: [
                  {
                    node: {
                      id: "proj_1",
                      name: "my-project",
                      services: {
                        edges: [
                          { node: { id: "svc_1", name: "api" } },
                          { node: { id: "svc_2", name: "worker" } },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      )) as typeof fetch;

    const apps = await listProviderApps("railway", "railway-token");
    assert.deepEqual(apps, [
      {
        id: "svc_1",
        name: "my-project / api",
        provider: "railway",
        projectId: "proj_1",
      },
      {
        id: "svc_2",
        name: "my-project / worker",
        provider: "railway",
        projectId: "proj_1",
      },
    ]);
  });

  it("merges Cloudflare Pages and Workers discovery", async () => {
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/accounts")) {
        return new Response(JSON.stringify({ result: [{ id: "acct_1" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/pages/projects")) {
        return new Response(
          JSON.stringify({ result: [{ id: "page_1", name: "site" }] }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (url.includes("/workers/scripts")) {
        return new Response(
          JSON.stringify({ result: [{ id: "worker_1", name: "worker_1" }] }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const apps = await listProviderApps("cloudflare", "cf-token");
    assert.equal(apps[0]?.type, "pages");
    assert.equal(apps[1]?.type, "worker");
  });
});
