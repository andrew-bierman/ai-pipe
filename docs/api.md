# API Reference

Complete reference for every `ai-pipe` CLI flag, output format, and behavior.

## Synopsis

```
ai-pipe [options] [prompt...]
```

Prompt words are joined with spaces. If no prompt is given and no stdin is available, the help text is printed.

## Options

### Prompt & Context

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `[prompt...]` | | string | | Prompt text. Multiple words are joined with spaces. |
| `--system <prompt>` | `-s` | string | | System prompt sent before the user prompt. |
| `--role <name>` | `-r` | string | | Load a system prompt from `~/.ai-pipe/roles/<name>.md`. |
| `--file <path>` | `-f` | string | | Include file contents in the prompt. Repeatable for multiple files. |
| `--image <path>` | `-i` | string | | Include an image in the prompt for vision models. Repeatable. |

### Model & Provider

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--model <model>` | `-m` | string | `openai/gpt-4o` | Model in `provider/model-id` format. If no provider prefix is given, defaults to `openai`. |

### Output

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--json` | `-j` | boolean | `false` | Output the full JSON response object (text, model, usage, finishReason). |
| `--no-stream` | | boolean | `false` | Wait for the full response before printing. Streaming is on by default. |
| `--markdown` | | boolean | `false` | Render the response as formatted markdown in the terminal (ANSI colors). |
| `--cost` | | boolean | `false` | Show estimated cost of the request on stderr after the response. |

### Generation Parameters

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--temperature <n>` | `-t` | float | Provider default | Sampling temperature. Range: `0` to `2`. |
| `--max-output-tokens <n>` | | integer | Provider default | Maximum number of tokens to generate. |

### Sessions

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--session <name>` | `-C` | string | | Session name for conversation history. Messages are stored in `~/.ai-pipe/history/<name>.json`. |

### Configuration

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--config <path>` | `-c` | string | `~/.ai-pipe` | Path to a custom config directory. |

### Info & Utility

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--providers` | | boolean | `false` | List all supported providers and whether their API keys are set. |
| `--roles` | | boolean | `false` | List available role files from `~/.ai-pipe/roles/`. |
| `--completions <shell>` | | string | | Generate shell completions. Supported: `bash`, `zsh`, `fish`. |
| `--version` | `-V` | boolean | | Print the version number and exit. |
| `--help` | `-h` | boolean | | Print the help text and exit. |

## Flag Examples

```bash
# Specify a model
ai-pipe -m anthropic/claude-sonnet-4-5 "hello"

# System prompt
ai-pipe -s "You are a pirate" "tell me about the sea"

# Use a role file
ai-pipe -r reviewer -f main.go

# Attach multiple files
ai-pipe -f src/app.ts -f src/utils.ts "find bugs in these files"

# Attach an image (vision models)
ai-pipe -i screenshot.png "describe this image"

# JSON output
ai-pipe -j "what is 2+2"

# Disable streaming
ai-pipe --no-stream "list 3 colors"

# Render markdown
ai-pipe --markdown "explain monads with code examples"

# Show cost
ai-pipe --cost "write a poem"

# Set temperature
ai-pipe -t 0.0 "what is the capital of France"

# Max tokens
ai-pipe --max-output-tokens 50 "write a short haiku"

# Use a session
ai-pipe -C mychat "hello, who are you?"
ai-pipe -C mychat "what did I just ask?"

# Custom config directory
ai-pipe -c ./project-config "summarize this"

# List providers
ai-pipe --providers

# List roles
ai-pipe --roles

# Generate shell completions
eval "$(ai-pipe --completions bash)"
```

## JSON Output Schema

When `--json` / `-j` is used, the response is a JSON object written to stdout:

```json
{
  "text": "The response text from the model.",
  "model": "openai/gpt-4o",
  "usage": {
    "inputTokens": 12,
    "outputTokens": 48,
    "totalTokens": 60,
    "inputTokenDetails": {
      "noCacheTokens": 12,
      "cacheReadTokens": 0,
      "cacheWriteTokens": 0
    },
    "outputTokenDetails": {
      "textTokens": 48,
      "reasoningTokens": 0
    }
  },
  "finishReason": "stop"
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | The generated text response. |
| `model` | string | The model string used (in `provider/model-id` format). |
| `usage.inputTokens` | number | Number of input tokens consumed. |
| `usage.outputTokens` | number | Number of output tokens generated. |
| `usage.totalTokens` | number | Total tokens (input + output). |
| `usage.inputTokenDetails` | object | Breakdown of input token types (optional, provider-dependent). |
| `usage.inputTokenDetails.noCacheTokens` | number | Tokens not served from cache. |
| `usage.inputTokenDetails.cacheReadTokens` | number | Tokens served from prompt cache. |
| `usage.inputTokenDetails.cacheWriteTokens` | number | Tokens written to prompt cache. |
| `usage.outputTokenDetails` | object | Breakdown of output token types (optional, provider-dependent). |
| `usage.outputTokenDetails.textTokens` | number | Standard text output tokens. |
| `usage.outputTokenDetails.reasoningTokens` | number | Tokens used for chain-of-thought reasoning. |
| `finishReason` | string | Why generation stopped: `"stop"`, `"length"`, `"content-filter"`, etc. |

**Note:** The `inputTokenDetails` and `outputTokenDetails` fields are optional and only present when the provider returns them. Not all providers support token detail breakdowns.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success. Response was generated and written to stdout. |
| `1` | Error. Validation failure, missing API key, file not found, API error, or invalid options. The error message is written to stderr. |

## stdin / stdout / stderr Behavior

`ai-pipe` is designed to be a well-behaved Unix citizen:

| Stream | Content |
|--------|---------|
| **stdin** | Optional piped input. Appended to the prompt after any argument text and file contents. Detected automatically via `isTTY` check. |
| **stdout** | The model's response text. In streaming mode, tokens are written as they arrive. In `--json` mode, the full JSON object is written. |
| **stderr** | Error messages (prefixed with `Error:`), cost information (`--cost` flag), and diagnostics. Never mixed with response output. |

### Prompt Assembly Order

When multiple input sources are used, the final prompt is assembled in this order:

1. **Argument text** -- the `[prompt...]` positional arguments, joined with spaces
2. **File contents** -- each `--file` path, formatted as `# <path>\n```\n<content>\n````
3. **stdin** -- the full piped input, trimmed

All parts are joined with double newlines.

### Streaming vs Non-Streaming

| Mode | Behavior |
|------|----------|
| **Streaming** (default) | Tokens are written to stdout as they arrive from the API. A trailing newline is added when the stream ends. |
| **Non-streaming** (`--no-stream`) | The full response is buffered, then written to stdout at once with a trailing newline. |
| **JSON** (`--json`) | Implies non-streaming. The full response is collected, then the JSON object is printed. |

### Session Mode

When `--session <name>` / `-C <name>` is used:

- Conversation history is loaded from `~/.ai-pipe/history/<name>.json`
- The current user message is appended to the history
- The full message array is sent to the model
- The assistant's response is appended and the history file is saved
- Session names are sanitized to allow only alphanumeric characters, hyphens, and underscores

## Priority / Override Order

Settings resolve in this order (first wins):

1. CLI flags (`--model`, `--system`, `--temperature`, etc.)
2. Config file values (`~/.ai-pipe/config.json`)
3. Built-in defaults (`openai/gpt-4o`, streaming on, etc.)

For API keys:

1. Environment variables (`OPENAI_API_KEY`, etc.)
2. Config file keys (`~/.ai-pipe/apiKeys.json`)

## Shell Completions

Generate and install tab-completions for your shell:

```bash
# bash -- add to ~/.bashrc
eval "$(ai-pipe --completions bash)"

# zsh -- add to ~/.zshrc
eval "$(ai-pipe --completions zsh)"

# fish -- save to completions directory
ai-pipe --completions fish > ~/.config/fish/completions/ai-pipe.fish
```

Completions cover all flags, provider prefixes for `--model`, file paths for `--file`, directories for `--config`, and shell names for `--completions`.
