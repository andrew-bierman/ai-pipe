#!/usr/bin/env bun

/**
 * scripts/spawn-roadmap.ts
 * Spawn a subagent to work on a roadmap feature
 *
 * Usage: bun scripts/spawn-roadmap.ts <feature-name>
 * Example: bun scripts/spawn-roadmap.ts "response-caching"
 */

import { $ } from "bun";

const FEATURE = Bun.argv[2];

if (!FEATURE) {
  console.error("Usage: bun scripts/spawn-roadmap.ts <feature-name>");
  console.error("Example: bun scripts/spawn-roadmap.ts response-caching");
  process.exit(1);
}

const BRANCH_NAME = `feat/${FEATURE.toLowerCase().replace(/\s+/g, "-")}`;

console.log(`🚀 Spawning subagent for "${FEATURE}"...`);
console.log(`   Branch: ${BRANCH_NAME}`);
console.log();

async function main() {
  // Create worktree
  console.log("📁 Creating worktree...");
  await $`git worktree add ../worktrees/${BRANCH_NAME} main`.catch(() => {
    console.log("   Worktree already exists, using existing one");
  });

  // Create and push branch
  await $`git checkout ${BRANCH_NAME}`.catch(async () => {
    console.log("🔀 Creating new branch...");
    await $`git checkout -b ${BRANCH_NAME}`;
  });

  await $`git push -u origin ${BRANCH_NAME}`;

  console.log();
  console.log("✅ Ready! Spawn a subagent to work on this feature.");
  console.log();
  console.log(
    `   Worktree: /Users/andrewbierman/Code/worktrees/${BRANCH_NAME}`,
  );
  console.log(`   Branch: ${BRANCH_NAME}`);
  console.log();
  console.log("Next: Use OpenClaw to spawn a subagent with the task:");
  console.log(
    `   "Work on ${FEATURE} in /Users/andrewbierman/Code/worktrees/${BRANCH_NAME}"`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
