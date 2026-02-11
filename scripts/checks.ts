#!/usr/bin/env bun

// scripts/checks.ts - Run all checks for ai-pipe

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = join(__dirname, "..");

async function run() {
  console.log("Running checks for ai-pipe...\n");

  // Run typecheck
  console.log("📋 Type checking...");
  const { success: typeSuccess } = await new Promise<{ success: boolean }>(
    (resolve) => {
      const proc = Bun.spawn(["bun", "run", "typecheck"], {
        cwd: PROJECT_ROOT,
        stdout: "inherit",
        stderr: "inherit",
      });
      proc.exited.then((code) => resolve({ success: code === 0 }));
    },
  );

  if (!typeSuccess) {
    console.error("❌ Type check failed\n");
    process.exit(1);
  }
  console.log("✅ Type check passed\n");

  // Run lint
  console.log("🎨 Linting...");
  const { success: lintSuccess } = await new Promise<{ success: boolean }>(
    (resolve) => {
      const proc = Bun.spawn(["bun", "run", "lint:check"], {
        cwd: PROJECT_ROOT,
        stdout: "inherit",
        stderr: "inherit",
      });
      proc.exited.then((code) => resolve({ success: code === 0 }));
    },
  );

  if (!lintSuccess) {
    console.error("❌ Lint check failed\n");
    process.exit(1);
  }
  console.log("✅ Lint check passed\n");

  // Run tests
  console.log("🧪 Running tests...");
  const { success: testSuccess } = await new Promise<{ success: boolean }>(
    (resolve) => {
      const proc = Bun.spawn(["bun", "test"], {
        cwd: PROJECT_ROOT,
        stdout: "inherit",
        stderr: "inherit",
      });
      proc.exited.then((code) => resolve({ success: code === 0 }));
    },
  );

  if (!testSuccess) {
    console.error("❌ Tests failed\n");
    process.exit(1);
  }
  console.log("✅ Tests passed\n");

  console.log("✨ All checks passed!");
}

run();
