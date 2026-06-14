import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN =
  /\b(console\.(log|warn|error|info)|log\.(info|warn|error|debug))\([^)]*\b(token|accessToken|encToken|authTag|jwtSecret|encryptionKey)\b/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (entry !== "dist" && entry !== "node_modules") {
        walk(full, out);
      }
      continue;
    }

    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }

  return out;
}

let failed = false;

for (const file of walk("apps/api/src")) {
  const content = readFileSync(file, "utf8");
  content.split(/\r?\n/).forEach((line, index) => {
    if (FORBIDDEN.test(line)) {
      console.error(
        `${file}:${index + 1}: possible secret in log statement: ${line.trim()}`,
      );
      failed = true;
    }
  });
}

process.exit(failed ? 1 : 0);
