import crypto from "crypto";
import { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { credentials } from "../db/schema.js";
import { encrypt } from "../crypto/index.js";
import { decrypt } from "../crypto/index.js";
import { and, eq } from "drizzle-orm";
import { ensureUserRecord } from "../auth/users.js";
import {
  clearOAuthStateCookie,
  clearSessionCookie,
  createOAuthStateCookie,
  readOAuthState,
  requireSession,
} from "../auth/session.js";
import {
  getProviderDescriptor,
  normalizeProvider,
  providerRegistry,
} from "../providers/registry.js";
import { listProviderApps } from "../providers/providerApps.js";
import { serviceSyncCoordinator } from "../polling/ServiceSync.js";

type AuthQuery = {
  code?: string;
  access_token?: string;
  token?: string;
  state?: string;
};

function providerRedirectUri(provider: string, webBaseUrl: string) {
  return `${webBaseUrl}/api/providers/${provider}/callback`;
}

function buildAuthorizeUrl(provider: string, clientId: string, state: string, webBaseUrl: string) {
  const descriptor = getProviderDescriptor(provider);
  if (!descriptor) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const authUrl =
    process.env[`${descriptor.authEnvPrefix}_AUTH_URL`] ||
    descriptor.defaultAuthorizeUrl;
  const scopes =
    process.env[`${descriptor.authEnvPrefix}_SCOPES`] ||
    descriptor.scopes.join(" ");
  const redirectUri =
    process.env[`${descriptor.authEnvPrefix}_REDIRECT_URI`] ||
    providerRedirectUri(provider, webBaseUrl);

  const url = new URL(authUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeToken(provider: string, code: string, webBaseUrl: string) {
  const descriptor = getProviderDescriptor(provider);
  if (!descriptor) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const clientId = process.env[`${descriptor.authEnvPrefix}_CLIENT_ID`];
  const clientSecret = process.env[`${descriptor.authEnvPrefix}_CLIENT_SECRET`];
  const tokenUrl =
    process.env[`${descriptor.authEnvPrefix}_TOKEN_URL`] ||
    descriptor.defaultTokenUrl;

  if (!clientId || !clientSecret || !tokenUrl) {
    throw new Error(`${descriptor.label} OAuth not configured`);
  }

  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("code", code);
  params.set("grant_type", "authorization_code");
  params.set(
    "redirect_uri",
    process.env[`${descriptor.authEnvPrefix}_REDIRECT_URI`] ||
      providerRedirectUri(provider, webBaseUrl),
  );

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed for ${provider}: ${text}`);
  }

  const json = (await response.json()) as {
    access_token?: string;
    token?: string;
  };
  return json.access_token || json.token;
}

async function storeProviderCredential(
  userId: string,
  provider: string,
  token: string,
  label?: string,
) {
  const enc = encrypt(token);
  const record = {
    id: crypto.randomUUID(),
    userId,
    provider,
    label: label || provider,
    encToken: enc.encToken,
    iv: enc.iv,
    authTag: enc.authTag,
    createdAt: new Date(),
  };

  db.insert(credentials).values(record).run();
  return record;
}

export default async function providerRoutes(fastify: FastifyInstance) {
  const getWebBaseUrl = (request: any) => {
    if (process.env.WEB_BASE_URL) return process.env.WEB_BASE_URL.replace(/\/$/, "");
    const proto = request.headers["x-forwarded-proto"] || "http";
    const host = request.headers["x-forwarded-host"] || request.headers.host || "localhost:3000";
    return `${Array.isArray(proto) ? proto[0] : proto}://${Array.isArray(host) ? host[0] : host}`;
  };

  fastify.get("/", async (request, reply) => {
    try {
      const user = await requireSession(fastify, request);
      const connected = db
        .select({ provider: credentials.provider })
        .from(credentials)
        .where(eq(credentials.userId, user.id))
        .all();
      const connectedProviders = new Set(connected.map((row) => row.provider));

      return Object.values(providerRegistry).map((provider) => ({
        key: provider.key,
        label: provider.label,
        connected: connectedProviders.has(provider.key),
        appsAvailable:
          provider.key !== "railway" || connectedProviders.has(provider.key),
      }));
    } catch {
      reply.status(401).send({ error: "Unauthorized" });
    }
  });

  fastify.get("/:provider/auth", async (request, reply) => {
    const { provider } = request.params as { provider: string };
    const descriptor = getProviderDescriptor(provider);
    const user = await requireSession(fastify, request).catch(() => undefined);

    if (!descriptor) {
      reply.status(400).send({ error: "Unsupported provider" });
      return;
    }

    if (!user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    ensureUserRecord(user);

    const clientId = process.env[`${descriptor.authEnvPrefix}_CLIENT_ID`];
    if (!clientId) {
      reply
        .status(501)
        .send({ error: `${descriptor.label} OAuth client is not configured` });
      return;
    }

    const state = crypto.randomUUID();
    const url = buildAuthorizeUrl(provider, clientId, state, getWebBaseUrl(request));
    reply.header(
      "Set-Cookie",
      createOAuthStateCookie(`provider_${provider}`, state),
    );
    reply.redirect(url);
  });

  fastify.get("/:provider/callback", async (request, reply) => {
    const { provider } = request.params as { provider: string };
    const descriptor = getProviderDescriptor(provider);
    if (!descriptor) {
      reply.status(400).send({ error: "Unsupported provider" });
      return;
    }

    const { code, access_token, token, state } = request.query as AuthQuery;
    const user = await requireSession(fastify, request).catch(() => undefined);
    const stateContext = `provider_${provider}`;
    const expectedState = readOAuthState(request, stateContext);

    if (!user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    if (!state || !expectedState || state !== expectedState) {
      reply.header("Set-Cookie", clearOAuthStateCookie(stateContext));
      reply.status(400).send({ error: "Invalid OAuth state" });
      return;
    }

    reply.header("Set-Cookie", clearOAuthStateCookie(stateContext));
    ensureUserRecord(user);

    let providerToken = access_token || token;
    if (!providerToken && code) {
      providerToken = await exchangeToken(provider, code, getWebBaseUrl(request));
    }

    if (!providerToken) {
      reply.header("Set-Cookie", clearOAuthStateCookie(stateContext));
      reply.status(400).send({ error: "No provider token received" });
      return;
    }

    await storeProviderCredential(
      user.id,
      provider,
      providerToken,
      descriptor.label,
    );
    await serviceSyncCoordinator.refreshSchedules();

    reply.redirect(
      `${getWebBaseUrl(request)}/settings?provider=${encodeURIComponent(provider)}`,
    );
  });

  fastify.get("/:provider/apps", async (request, reply) => {
    const { provider } = request.params as { provider: string };
    const normalized = normalizeProvider(provider);
    if (!normalized) {
      reply.status(400).send({ error: "Unsupported provider" });
      return;
    }

    const user = await requireSession(fastify, request).catch(() => undefined);
    if (!user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    const credential = db
      .select()
      .from(credentials)
      .where(
        and(
          eq(credentials.userId, user.id),
          eq(credentials.provider, provider),
        ),
      )
      .get();
    if (!credential) {
      return { provider, apps: [], connected: false };
    }

    const token = credential.encToken
      ? decrypt(credential.encToken, credential.iv, credential.authTag)
      : "";
    const apps = await listProviderApps(provider, token);

    return { provider, connected: true, apps };
  });

}
