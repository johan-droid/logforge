// Browser requests always go through the web origin so auth cookies remain
// scoped to the frontend domain in production.
export const API_BASE = "";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "LogForge";
