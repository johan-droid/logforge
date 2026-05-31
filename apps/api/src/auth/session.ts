import type { FastifyInstance, FastifyRequest } from "fastify";

export type SessionUser = {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  sub?: string;
};

const SESSION_COOKIE = "logforge_session";
const OAUTH_STATE_COOKIE_PREFIX = "logforge_oauth_state_";

export function createSessionCookie(token: string) {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${60 * 60 * 24 * 7}`,
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function readCookie(request: FastifyRequest, name: string) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;

  const cookies = cookieHeader.split(";").map((part) => part.trim());
  const found = cookies.find((part) => part.startsWith(`${name}=`));
  if (!found) return undefined;

  return decodeURIComponent(found.slice(name.length + 1));
}

function oauthStateCookieName(context: string) {
  const safeContext = context.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  return `${OAUTH_STATE_COOKIE_PREFIX}${safeContext}`;
}

export function createOAuthStateCookie(context: string, state: string) {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${oauthStateCookieName(context)}=${encodeURIComponent(state)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${60 * 10}`,
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function clearOAuthStateCookie(context: string) {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${oauthStateCookieName(context)}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function readOAuthState(request: FastifyRequest, context: string) {
  return readCookie(request, oauthStateCookieName(context));
}

export function getSessionToken(request: FastifyRequest) {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }

  return readCookie(request, SESSION_COOKIE);
}

export async function requireSession(
  fastify: FastifyInstance,
  request: FastifyRequest,
) {
  const token = getSessionToken(request);
  if (!token) {
    throw new Error("Unauthorized");
  }

  return fastify.jwt.verify<SessionUser>(token);
}
