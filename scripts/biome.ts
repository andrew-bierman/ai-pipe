#!/usr/bin/env bun

/**
 * scripts/biome.ts
 * Run biome lint check
 */

import { $ } from "bun";

async function main() {
  console.log("🔧 Running biome check...");
  await $`bunx biome check --write .`.catch(() => {
    console.error("❌ biome check failed");
    process.exit(1);
  });
  console.log("✅ biome check passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
