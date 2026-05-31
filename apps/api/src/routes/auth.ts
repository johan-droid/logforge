import crypto from "crypto";
import { FastifyInstance } from "fastify";
import { ensureUserRecord } from "../auth/users.js";
import {
  clearOAuthStateCookie,
  clearSessionCookie,
  createOAuthStateCookie,
  createSessionCookie,
  readOAuthState,
  requireSession,
} from "../auth/session.js";

export default async function authRoutes(fastify: FastifyInstance) {
  // Return the authenticated session user for frontend auth gating.
  fastify.get("/me", async (request, reply) => {
    const user = await requireSession(fastify, request).catch(() => undefined);
    if (!user) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }

    return {
      user: {
        id: user.id || user.sub,
        email: user.email,
        name: user.name,
        role: user.role || "user",
      },
    };
  });

  // Redirect user to Google OAuth consent screen
  fastify.get("/google", async (_request, reply) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = `${process.env.API_BASE_URL || "http://localhost:3001"}/api/auth/google/callback`;
    const scope = encodeURIComponent("openid email profile");

    if (!clientId) {
      reply.status(500).send({ error: "Google OAuth not configured" });
      return;
    }

    const state = crypto.randomUUID();
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri,
    )}&response_type=code&scope=${scope}&state=${encodeURIComponent(state)}&access_type=offline&prompt=consent`;

    reply.header("Set-Cookie", createOAuthStateCookie("google", state));
    reply.redirect(url);
  });

  // OAuth callback — exchange code for tokens and create a session JWT
  fastify.get("/google/callback", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const code = query.code;
    const state = query.state;
    const expectedState = readOAuthState(request, "google");

    if (!code || !state) {
      reply.header("Set-Cookie", clearOAuthStateCookie("google"));
      reply.status(400).send({ error: "Missing OAuth callback parameters" });
      return;
    }

    if (!expectedState || expectedState !== state) {
      reply.header("Set-Cookie", clearOAuthStateCookie("google"));
      reply.status(400).send({ error: "Invalid OAuth state" });
      return;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.API_BASE_URL || "http://localhost:3001"}/api/auth/google/callback`;

    if (!clientId || !clientSecret) {
      reply.status(500).send({ error: "Google OAuth not configured" });
      return;
    }

    try {
      const params = new URLSearchParams();
      params.append("code", code);
      params.append("client_id", clientId);
      params.append("client_secret", clientSecret);
      params.append("redirect_uri", redirectUri);
      params.append("grant_type", "authorization_code");

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      const tokenJson = await tokenRes.json();

      const accessToken = tokenJson.access_token as string | undefined;

      if (!accessToken) {
        fastify.log.error("No access token from Google", tokenJson);
        reply.status(500).send({ error: "Failed to obtain access token" });
        return;
      }

      const userRes = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const user = await userRes.json();

      if (!user?.sub) {
        reply.header("Set-Cookie", clearOAuthStateCookie("google"));
        reply.status(500).send({ error: "Google user profile is invalid" });
        return;
      }

      ensureUserRecord({
        id: user.sub,
        email: user.email,
        name: user.name,
        role: "user",
      });

      const token = fastify.jwt.sign({
        id: user.sub,
        email: user.email,
        name: user.name,
        role: "user",
      });

      reply.header("Set-Cookie", [
        clearOAuthStateCookie("google"),
        clearSessionCookie(),
        createSessionCookie(token),
      ]);
      reply.redirect(
        `${process.env.WEB_BASE_URL || "http://localhost:3000"}/dashboard`,
      );
    } catch (err) {
      reply.header("Set-Cookie", clearOAuthStateCookie("google"));
      fastify.log.error(err);
      reply.status(500).send({ error: "OAuth exchange failed" });
    }
  });

  fastify.post("/logout", async (_request, reply) => {
    reply.header("Set-Cookie", clearSessionCookie());
    return { success: true };
  });
}
