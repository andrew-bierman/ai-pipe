# Contributing to ai-pipe

Thanks for your interest in contributing to `ai-pipe`. This guide covers how to set up the project, run tests, and submit changes.

## Prerequisites

- [Bun](https://bun.sh/) v1.3.8 or later
- Node.js 22 or later (for TypeScript type checking)
- Git

## Dev Setup

```bash
# Clone the repo
git clone https://github.com/andrew-bierman/ai-pipe.git
cd ai-pipe

# Install dependencies
bun install

# Link the CLI for local development
bun link
```

After linking, the `ai-pipe` and `ai` commands point to your local source. Changes take effect immediately (no build step needed).

## Running Tests

```bash
# Run all tests
bun test

# Run a specific test file
bun test src/__tests__/cli.test.ts

# Run tests matching a pattern
bun test --grep "should parse"
```

The test suite covers CLI option parsing, configuration loading, provider resolution, cost calculation, markdown rendering, completions generation, and end-to-end behavior.

## Linting

`ai-pipe` uses [Biome](https://biomejs.dev/) for linting and formatting.

```bash
# Check and auto-fix
bunx biome check --write .

# Check only (no auto-fix) -- useful in CI
bunx biome check .
```

## Type Checking

```bash
bun run typecheck
```

This runs `tsc --noEmit` to catch type errors without emitting files.

## Building

Compile to a standalone binary:

```bash
# Current platform
bun run build

# Specific targets
bun run build:mac         # macOS ARM
bun run build:mac-x64     # macOS Intel
bun run build:linux       # Linux x64
bun run build:linux-arm   # Linux ARM
bun run build:all         # All targets
```

Binaries are output to `dist/`.

## Architecture Overview

The codebase is organized into focused modules under `src/`:

```
src/
├── index.ts          # CLI entrypoint and main run() function
├── constants.ts      # App-wide constants (name, defaults, schemas)
├── provider.ts       # Provider registry, model resolution, env var checks
├── config.ts         # Config loading (config.json, apiKeys.json, roles)
├── cost.ts           # Pricing data and cost calculation
├── completions.ts    # Shell completion generators (bash, zsh, fish)
├── markdown.ts       # Terminal markdown renderer (ANSI codes)
└── __tests__/        # Test files (one per module)
    ├── cli.test.ts
    ├── completions.test.ts
    ├── config.test.ts
    ├── constants.test.ts
    ├── cost.test.ts
    ├── index.test.ts
    ├── markdown.test.ts
    ├── provider.test.ts
    └── sdk-compat.test.ts
```

### Module Responsibilities

| File | What It Does |
|------|-------------|
| **index.ts** | Defines CLI options with Commander.js, parses arguments, reads stdin/files/images, assembles prompts, calls the Vercel AI SDK (`generateText` / `streamText`), manages session history, and handles JSON output. |
| **constants.ts** | Exports `APP` -- the single source of truth for the app name (`ai-pipe`), default model (`openai/gpt-4o`), config directory name (`.ai-pipe`), temperature range, and supported shells. |
| **provider.ts** | Creates the Vercel AI SDK provider registry with all 18 providers. Exports `SUPPORTED_PROVIDERS`, `PROVIDER_ENV_VARS`, model string parsing, `resolveModel()`, and `printProviders()`. |
| **config.ts** | Loads `config.json` and `apiKeys.json` from the config directory. Handles role loading from `~/.ai-pipe/roles/*.md` and listing available roles. All file I/O uses `Bun.file()`. |
| **cost.ts** | Contains pricing data for all providers and models. Exports `calculateCost()` and `formatCost()` for the `--cost` flag. Prices are per 1M tokens. |
| **completions.ts** | Generates shell completion scripts for bash, zsh, and fish. Used by the `--completions` flag. |
| **markdown.ts** | Provides terminal markdown rendering used by the `--markdown` flag. Uses `Bun.markdown.render()` to convert markdown to ANSI-formatted output with headings, code blocks, lists, tables, links, and more. |

### Data Flow

```
User Input (args + stdin + files)
        │
        ▼
   CLI Parsing (Commander.js + Zod validation)
        │
        ▼
   Config Loading (~/.ai-pipe/config.json + apiKeys.json)
        │
        ▼
   Option Resolution (CLI > config > defaults)
        │
        ▼
   Model Resolution (provider registry lookup + env var check)
        │
        ▼
   Prompt Assembly (args + file contents + stdin)
        │
        ▼
   Session History (load/save ~/.ai-pipe/history/*.json)
        │
        ▼
   AI SDK Call (generateText or streamText)
        │
        ▼
   Output (stdout: text or JSON, stderr: errors + cost)
```

### Key Libraries

| Library | Purpose |
|---------|---------|
| [ai](https://sdk.vercel.ai/) (Vercel AI SDK) | Unified interface for all AI providers |
| [commander](https://github.com/tj/commander.js) | CLI argument parsing |
| [zod](https://zod.dev/) | Schema validation for options, config, and history |

## Making Changes

### Adding a New Provider

1. Install the AI SDK adapter: `bun add @ai-sdk/newprovider`
2. Add the import and registry entry in `src/provider.ts`
3. Add the provider to `SUPPORTED_PROVIDERS`
4. Add env var(s) to `PROVIDER_ENV_VARS`
5. Add pricing data in `src/cost.ts`
6. Add tests in `src/__tests__/provider.test.ts`

### Adding a New CLI Flag

1. Add the option to the `CLIOptions` interface and `CLIOptionsSchema` in `src/index.ts`
2. Add the Commander.js `.option()` call in `setupCLI()`
3. Handle the flag in the `run()` function
4. Update shell completions in `src/completions.ts`
5. Add tests in `src/__tests__/cli.test.ts`

### Adding a New Role

Roles are just markdown files -- no code changes needed:

```bash
cat > ~/.ai-pipe/roles/my-role.md << 'EOF'
Your system prompt here.
EOF
```

## Pull Request Process

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```
3. **Make your changes** with tests
4. **Run the checks**:
   ```bash
   bun test
   bun run typecheck
   bunx biome check .
   ```
5. **Commit** with a [gitmoji](https://gitmoji.dev/) prefix:
   ```
   ✨ Add new provider support
   🐛 Fix session history loading
   ♻️ Refactor config loading
   ✅ Add tests for cost calculation
   📝 Update provider documentation
   ```
6. **Push** and open a Pull Request against `main`

### Commit Message Format

Use gitmoji prefixes:

| Emoji | Code | Use For |
|-------|------|---------|
| ✨ | `:sparkles:` | New feature |
| 🐛 | `:bug:` | Bug fix |
| ♻️ | `:recycle:` | Refactor |
| 📝 | `:memo:` | Documentation |
| ✅ | `:white_check_mark:` | Tests |
| 🔧 | `:wrench:` | Configuration |
| ⬆️ | `:arrow_up:` | Upgrade dependencies |
| 🔥 | `:fire:` | Remove code or files |
| 📦 | `:package:` | Build system |

### What Makes a Good PR

- Focused on a single change
- Includes tests for new behavior
- Passes all existing tests
- Follows existing code style (Biome handles this)
- Has a clear description of what and why

## Questions?

Open an [issue](https://github.com/andrew-bierman/ai-pipe/issues) or start a [discussion](https://github.com/andrew-bierman/ai-pipe/discussions).
