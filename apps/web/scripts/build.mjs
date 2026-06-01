/* global process */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const nextCliPath = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);

const child = spawn(process.execPath, [nextCliPath, "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    LOGFORGE_ALLOW_LOCAL_API_FALLBACK:
      process.env.API_PROXY_TARGET ||
      process.env.API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE ||
      process.env.NODE_ENV === "production"
        ? process.env.LOGFORGE_ALLOW_LOCAL_API_FALLBACK
        : "1",
    LOGFORGE_ENFORCE_API_PROXY_TARGET:
      process.env.NODE_ENV === "production"
        ? "1"
        : process.env.LOGFORGE_ENFORCE_API_PROXY_TARGET,
    NODE_ENV: "production",
  },
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
