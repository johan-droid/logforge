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
