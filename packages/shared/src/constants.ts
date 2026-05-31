export const RATE_LIMITS = {
  heroku: { callsPerHr: 4500, pollIntervalMs: 30000 },
  render: { callsPerHr: 6000, pollIntervalMs: 15000 },
  vercel: { callsPerHr: 180000, pollIntervalMs: 10000 },
  railway: { callsPerHr: 18000, pollIntervalMs: 15000 },
  cloudflare: { callsPerHr: 14400, pollIntervalMs: 20000 }
};

export const SAFETY_THRESHOLD = 0.1;
export const LOG_BUFFER_SIZE = 5000;
