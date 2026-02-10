#!/usr/bin/env bun

/**
 * scripts/checks.ts
 * Pre-commit checks runner with configurable scripts
 */

interface Check {
  name: string;
  cmd: string[];
}

const CHECKS: Check[] = [
  {
    name: "sort-package-json",
    cmd: ["bunx", "sort-package-json", "package.json"],
  },
];

async function main() {
  console.log("Running pre-commit checks...\n");

  for (const check of CHECKS) {
    console.log(`📦 ${check.name}...`);
    const proc = Bun.spawn({
      cmd: check.cmd,
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      console.error(`❌ ${check.name} failed`);
      process.exit(1);
    }
    console.log(`✅ ${check.name} passed`);
  }

  console.log("\n✅ All checks passed!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
