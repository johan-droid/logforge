import crypto from "node:crypto";
import { ProviderType } from "@repo/shared/types";
import { getProviderDescriptor, normalizeProvider } from "./registry.js";
import { railwayGraphQL } from "./railway-shared.js";

export type ProviderApp = {
  id: string;
  name: string;
  provider: string;
  type?: "pages" | "worker";
  projectId?: string;
};

async function fetchJson(
  url: string,
  token: string,
  headers: Record<string, string> = {},
) {
  return fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...headers,
    },
  });
}

async function resolveCloudflareAccountId(token: string) {
  let accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (accountId) {
    return accountId;
  }

  const accountsRes = await fetch("https://api.cloudflare.com/client/v4/accounts", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!accountsRes.ok) {
    return undefined;
  }

  const accountsData = (await accountsRes.json()) as {
    result?: Array<{ id: string }>;
  };
  const accounts = accountsData.result;
  if (!Array.isArray(accounts) || accounts.length === 0 || !accounts[0]) {
    return undefined;
  }

  accountId = accounts[0].id;
  return accountId;
}

export async function validateProviderToken(provider: string, token: string) {
  const normalized = normalizeProvider(provider);
  if (!normalized || !token.trim()) {
    return false;
  }

  if (normalized === ProviderType.CLOUDFLARE) {
    const response = await fetchJson(
      "https://api.cloudflare.com/client/v4/user/tokens/verify",
      token,
    );
    return response.ok;
  }

  if (normalized === ProviderType.RAILWAY) {
    try {
      await railwayGraphQL<{ me: { id?: string; email?: string } }>(
        token,
        "query { me { id } }",
        {},
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Cannot query field id")) {
        try {
          await railwayGraphQL<{ me: { email: string } }>(
            token,
            "query { me { email } }",
            {},
          );
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  const apps = await listProviderApps(normalized, token, { limit: 1 });
  return Array.isArray(apps);
}

export async function listProviderApps(
  provider: string,
  token: string,
  options: { limit?: number } = {},
): Promise<ProviderApp[]> {
  const descriptor = getProviderDescriptor(provider);
  const normalized = normalizeProvider(provider);
  if (!descriptor || !normalized) {
    return [];
  }

  const limit = options.limit ?? 100;

  if (normalized === ProviderType.RENDER) {
    const response = await fetchJson(
      `${descriptor.defaultAppsUrl}?limit=${limit}`,
      token,
    );
    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as Array<{
      id?: string;
      name?: string;
      service?: { id?: string; name?: string };
    }>;

    return data.map((item) => ({
      id: item.id || item.service?.id || crypto.randomUUID(),
      name: item.name || item.service?.name || "Unnamed service",
      provider: ProviderType.RENDER,
    }));
  }

  if (normalized === ProviderType.VERCEL) {
    const response = await fetchJson(
      `${descriptor.defaultAppsUrl}?limit=${limit}`,
      token,
    );
    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as {
      projects?: Array<{ id?: string; name?: string }>;
    };

    return (data.projects || []).map((project) => ({
      id: project.id || crypto.randomUUID(),
      name: project.name || "Unnamed project",
      provider: ProviderType.VERCEL,
    }));
  }

  if (normalized === ProviderType.HEROKU) {
    const response = await fetchJson(descriptor.defaultAppsUrl!, token, {
      Accept: "application/vnd.heroku+json; version=3",
    });
    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as Array<{
      id?: string;
      name?: string;
    }>;

    return data.slice(0, limit).map((app) => ({
      id: app.id || crypto.randomUUID(),
      name: app.name || "Unnamed app",
      provider: ProviderType.HEROKU,
    }));
  }

  if (normalized === ProviderType.CLOUDFLARE) {
    const accountId = await resolveCloudflareAccountId(token);
    if (!accountId) {
      return [];
    }

    const pagesResponse = await fetchJson(
      `${descriptor.defaultAppsUrl}/accounts/${accountId}/pages/projects?per_page=${limit}`,
      token,
    );
    if (!pagesResponse.ok) {
      return [];
    }

    const pagesData = (await pagesResponse.json()) as {
      result?: Array<{ id?: string; name?: string }>;
    };

    const pagesResults = (pagesData.result || []).map((project) => ({
      id: project.id || crypto.randomUUID(),
      name: project.name || "Unnamed Pages project",
      provider: ProviderType.CLOUDFLARE,
      type: "pages" as const,
    }));

    const workersResponse = await fetchJson(
      `${descriptor.defaultAppsUrl}/accounts/${accountId}/workers/scripts`,
      token,
    );
    let workerResults: ProviderApp[] = [];
    if (workersResponse.ok) {
      const workersData = (await workersResponse.json()) as {
        result?: Array<{ id?: string; name?: string }>;
      };

      workerResults = (workersData.result || []).map((script) => ({
        id: script.id || script.name || crypto.randomUUID(),
        name: script.name || "Unnamed Worker",
        provider: ProviderType.CLOUDFLARE,
        type: "worker" as const,
      }));
    }

    return [...pagesResults, ...workerResults].slice(0, limit);
  }

  if (normalized === ProviderType.RAILWAY) {
    let data: {
      me: {
        projects: {
          edges: Array<{
            node: {
              id: string;
              name: string;
              services: {
                edges: Array<{ node: { id: string; name: string } }>;
              };
            };
          }>;
        };
      };
    };

    try {
      data = await railwayGraphQL(token, `
        query {
          me {
            projects {
              edges { node { id name services { edges { node { id name } } } } }
            }
          }
        }
      `, {});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("projects")) {
        throw error;
      }

      data = await railwayGraphQL(token, `
        query {
          me {
            projects(first: 50) {
              edges { node { id name services { edges { node { id name } } } } }
            }
          }
        }
      `, {});
    }

    const apps: ProviderApp[] = [];
    for (const projectEdge of data.me.projects.edges) {
      for (const serviceEdge of projectEdge.node.services.edges) {
        apps.push({
          id: serviceEdge.node.id,
          name: `${projectEdge.node.name} / ${serviceEdge.node.name}`,
          provider: ProviderType.RAILWAY,
          projectId: projectEdge.node.id,
        });
      }
    }

    return apps.slice(0, limit);
  }

  return [];
}

export async function getCloudflareAccountId(token: string) {
  return resolveCloudflareAccountId(token);
}
