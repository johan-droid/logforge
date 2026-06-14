import { ProviderType } from "@repo/shared/types";

export type ProviderKey =
  | ProviderType.RENDER
  | ProviderType.VERCEL
  | ProviderType.HEROKU
  | ProviderType.CLOUDFLARE
  | ProviderType.RAILWAY;

export type ProviderDescriptor = {
  key: ProviderKey;
  label: string;
  shortLabel: string;
  defaultAppsUrl?: string;
  scopes: string[];
};

export const providerRegistry: Record<ProviderKey, ProviderDescriptor> = {
  [ProviderType.RENDER]: {
    key: ProviderType.RENDER,
    label: "Render",
    shortLabel: "Render",
    defaultAppsUrl: "https://api.render.com/v1/services",
    scopes: ["read"],
  },
  [ProviderType.VERCEL]: {
    key: ProviderType.VERCEL,
    label: "Vercel",
    shortLabel: "Vercel",
    defaultAppsUrl: "https://api.vercel.com/v9/projects",
    scopes: ["read"],
  },
  [ProviderType.HEROKU]: {
    key: ProviderType.HEROKU,
    label: "Heroku",
    shortLabel: "Heroku",
    defaultAppsUrl: "https://api.heroku.com/apps",
    scopes: ["read"],
  },
  [ProviderType.CLOUDFLARE]: {
    key: ProviderType.CLOUDFLARE,
    label: "Cloudflare",
    shortLabel: "Cloudflare",
    defaultAppsUrl: "https://api.cloudflare.com/client/v4",
    scopes: ["Account:Read", "Workers Scripts:Read", "Pages:Read"],
  },
  [ProviderType.RAILWAY]: {
    key: ProviderType.RAILWAY,
    label: "Railway",
    shortLabel: "Railway",
    defaultAppsUrl: "https://backboard.railway.app/graphql/v2",
    scopes: ["read"],
  },
};

export function normalizeProvider(provider: string): ProviderKey | undefined {
  if (
    provider === ProviderType.RENDER ||
    provider === ProviderType.VERCEL ||
    provider === ProviderType.HEROKU ||
    provider === ProviderType.CLOUDFLARE ||
    provider === ProviderType.RAILWAY
  ) {
    return provider;
  }

  return undefined;
}

export function getProviderDescriptor(provider: string) {
  const normalized = normalizeProvider(provider);
  return normalized ? providerRegistry[normalized] : undefined;
}
