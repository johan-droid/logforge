import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const webPackagePath = path.join(repoRoot, "apps", "web", "package.json");
const packagesDir = path.join(repoRoot, "packages");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const webPackage = readJson(webPackagePath);
const expectedReact = webPackage.dependencies?.react;
const expectedReactDom = webPackage.dependencies?.["react-dom"];

if (!expectedReact || !expectedReactDom) {
  console.error(
    "apps/web/package.json must declare both react and react-dom dependencies.",
  );
  process.exit(1);
}

const failures = [];

for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }

  const packageJsonPath = path.join(packagesDir, entry.name, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    continue;
  }

  const pkg = readJson(packageJsonPath);
  const pkgName = pkg.name || entry.name;
  const deps = pkg.dependencies || {};
  const peerDeps = pkg.peerDependencies || {};

  if (deps.react || deps["react-dom"]) {
    failures.push(
      `${pkgName} must not declare react/react-dom in dependencies; use peerDependencies instead.`,
    );
  }

  if (peerDeps.react && peerDeps.react !== expectedReact) {
    failures.push(
      `${pkgName} peerDependencies.react (${peerDeps.react}) must match apps/web (${expectedReact}).`,
    );
  }

  if (peerDeps["react-dom"] && peerDeps["react-dom"] !== expectedReactDom) {
    failures.push(
      `${pkgName} peerDependencies.react-dom (${peerDeps["react-dom"]}) must match apps/web (${expectedReactDom}).`,
    );
  }
}

if (failures.length > 0) {
  console.error("React runtime verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("React runtime verification passed.");
