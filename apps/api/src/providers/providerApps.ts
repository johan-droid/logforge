import crypto from "crypto";
import { ProviderType } from "@repo/shared/types";
import { getProviderDescriptor, normalizeProvider } from "./registry.js";

export type ProviderApp = {
  id: string;
  name: string;
  provider: string;
};

async function fetchJson(
  url: string,
  token: string,
  headers: Record<string, string> = {},
) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...headers,
    },
  });

  return response;
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
    return true;
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
    if (!response.ok) return [];

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
    if (!response.ok) return [];

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
    if (!response.ok) return [];

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
    let accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!accountId) {
      const accountsRes = await fetch("https://api.cloudflare.com/client/v4/accounts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (accountsRes.ok) {
        const accountsData = (await accountsRes.json()) as any;
        const accounts = accountsData?.result;
        if (Array.isArray(accounts) && accounts.length > 0) {
          accountId = accounts[0].id;
        }
      }
    }
    if (!accountId) return [];

    const response = await fetchJson(
      `${descriptor.defaultAppsUrl}/accounts/${accountId}/pages/projects?per_page=${limit}`,
      token,
    );
    if (!response.ok) return [];

    const data = (await response.json()) as {
      result?: Array<{ id?: string; name?: string }>;
    };
    return (data.result || []).map((project) => ({
      id: project.id || crypto.randomUUID(),
      name: project.name || "Unnamed Pages project",
      provider: ProviderType.CLOUDFLARE,
    }));
  }

  return [];
}
