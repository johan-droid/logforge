/* global process */

const configuredApiProxyTarget = (
  process.env.API_PROXY_TARGET ||
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  ""
).replace(/\/$/, "");
const allowLocalApiFallback =
  process.env.NODE_ENV !== "production" ||
  process.env.LOGFORGE_ALLOW_LOCAL_API_FALLBACK === "1";
const enforceApiProxyTarget =
  process.env.LOGFORGE_ENFORCE_API_PROXY_TARGET === "1";
const resolvedApiProxyTarget =
  configuredApiProxyTarget ||
  (allowLocalApiFallback ? "http://localhost:3001" : "");
const isLocalApiProxyTarget =
  /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(
    resolvedApiProxyTarget,
  );

if (!resolvedApiProxyTarget && enforceApiProxyTarget) {
  throw new Error(
    "API_PROXY_TARGET is required for production web builds. Set it to the LogForge API service URL or private host:port.",
  );
}

if (enforceApiProxyTarget && isLocalApiProxyTarget && !allowLocalApiFallback) {
  throw new Error(
    "API_PROXY_TARGET cannot point to localhost in production; it causes /api requests to loop back into the web service.",
  );
}

const apiProxyTarget = /^https?:\/\//.test(resolvedApiProxyTarget)
  ? resolvedApiProxyTarget
  : `http://${resolvedApiProxyTarget}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
