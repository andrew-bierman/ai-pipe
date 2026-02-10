#!/usr/bin/env bun

/**
 * scripts/checks.ts
 * Run all pre-commit checks: sort-package-json, biome, typecheck
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

const PKG_PATH = join(process.cwd(), "package.json");

function sortPackageJson() {
  console.log("📦 Sorting package.json...");
  const pkg = JSON.parse(readFileSync(PKG_PATH, "utf-8"));

  // Sort dependencies by key
  if (pkg.dependencies) {
    pkg.dependencies = Object.fromEntries(
      Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)),
    );
  }

  // Sort devDependencies by key
  if (pkg.devDependencies) {
    pkg.devDependencies = Object.fromEntries(
      Object.entries(pkg.devDependencies).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    );
  }

  // Sort peerDependencies by key
  if (pkg.peerDependencies) {
    pkg.peerDependencies = Object.fromEntries(
      Object.entries(pkg.peerDependencies).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    );
  }

  writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log("✅ package.json sorted");
}

async function runBiome() {
  console.log("🔧 Running biome check...");
  await $`bunx biome check --write .`.catch(() => {
    console.error("❌ biome check failed");
    process.exit(1);
  });
}

async function runTypecheck() {
  console.log("🔍 Running typecheck...");
  await $`bun run typecheck`.catch(() => {
    console.error("❌ typecheck failed");
    process.exit(1);
  });
}

async function main() {
  console.log("Running pre-commit checks...\n");

  sortPackageJson();
  await runBiome();
  await runTypecheck();

  console.log("\n✅ All checks passed!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
