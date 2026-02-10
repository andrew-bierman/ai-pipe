#!/usr/bin/env bun

/**
 * scripts/checks.ts
 * Run all pre-commit checks: sort-package-json, biome, typecheck
 */

import { $ } from "bun";

async function sortPackageJson() {
  console.log("📦 Sorting package.json...");
  await $`bunx sort-package-json package.json`.catch(() => {
    console.error("❌ sort-package-json failed");
    process.exit(1);
  });
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

  await sortPackageJson();
  await runBiome();
  await runTypecheck();

  console.log("\n✅ All checks passed!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
