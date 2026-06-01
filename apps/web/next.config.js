/* global process */

const configuredApiProxyTarget = (
  process.env.API_PROXY_TARGET ||
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://localhost:3001"
).replace(/\/$/, "");
const apiProxyTarget = /^https?:\/\//.test(configuredApiProxyTarget)
  ? configuredApiProxyTarget
  : `http://${configuredApiProxyTarget}`;

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
