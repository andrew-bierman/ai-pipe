#!/usr/bin/env bun

/**
 * scripts/typecheck.ts
 * Run TypeScript type checking
 */

import { $ } from "bun";

async function main() {
  console.log("🔍 Running typecheck...");
  await $`bun run typecheck`.catch(() => {
    console.error("❌ typecheck failed");
    process.exit(1);
  });
  console.log("✅ typecheck passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
