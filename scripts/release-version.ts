function parseVersion(value: unknown): [bigint, bigint, bigint] {
  if (typeof value === "string") {
    const [match, major, minor, patch] =
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value) ?? [];
    if (match === value && major && minor && patch) {
      return [BigInt(major), BigInt(minor), BigInt(patch)];
    }
  }
  throw new Error("package.json version must use stable SemVer (X.Y.Z).");
}

async function main() {
  const [mode, base] = Bun.argv.slice(2);
  const { version } = await Bun.file("package.json").json();
  const current = parseVersion(version);

  if (mode === "current") {
    console.log(version);
    return;
  }
  if (mode !== "require-bump" && mode !== "changed") {
    throw new Error("Expected current, require-bump, or changed.");
  }
  if (!base || !/^[a-f0-9]{40}$/.test(base)) {
    throw new Error(
      "Expected the base commit SHA to compare package versions.",
    );
  }

  const result = Bun.spawnSync(["git", "show", `${base}:package.json`], {
    stderr: "inherit",
  });
  if (result.exitCode !== 0) {
    throw new Error("Could not read package.json at the base commit.");
  }
  const { version: baseVersion } = JSON.parse(result.stdout.toString());
  const previous = parseVersion(baseVersion);
  const changes = [
    current[0] - previous[0],
    current[1] - previous[1],
    current[2] - previous[2],
  ];
  const firstChange = changes.find((change) => change !== 0n);
  if (firstChange === undefined && mode === "changed") return;
  if (firstChange === undefined || firstChange < 0n) {
    throw new Error(
      `Bump package.json from ${baseVersion} to a higher patch, minor, or major version (found ${version}).`,
    );
  }
  console.log(version);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
