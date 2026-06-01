/* global process */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const hasPortFlag = forwardedArgs.some(
  (arg) => arg === "-p" || arg === "--port" || arg.startsWith("--port="),
);
const hasHostnameFlag = forwardedArgs.some(
  (arg) => arg === "-H" || arg === "--hostname" || arg.startsWith("--hostname="),
);

const nextCliPath = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);

const args = ["start", ...forwardedArgs];

if (!hasPortFlag && process.env.PORT) {
  args.push("--port", process.env.PORT);
}

if (!hasHostnameFlag) {
  args.push("--hostname", "0.0.0.0");
}

const child = spawn(process.execPath, [nextCliPath, ...args], {
  stdio: "inherit",
  env: process.env,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}

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
