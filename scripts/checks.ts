#!/usr/bin/env bun

/**
 * scripts/checks.ts
 * Sort package.json using sort-package-json library
 */

import { $ } from "bun";

async function main() {
  console.log("📦 Sorting package.json...");
  await $`bunx sort-package-json package.json`.catch(() => {
    console.error("❌ sort-package-json failed");
    process.exit(1);
  });
  console.log("✅ package.json sorted");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
