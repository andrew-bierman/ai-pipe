# ai-pipe

A lean CLI for calling LLMs from the terminal. Text in, text out.

Built on the [Vercel AI SDK](https://sdk.vercel.ai/) with [Bun](https://bun.sh/).

## Features

- **16 providers** — OpenAI, Anthropic, Google, Perplexity, xAI, Mistral, Groq, DeepSeek, Cohere, OpenRouter, Azure AI, Together AI, Amazon Bedrock, Google Vertex AI, Ollama, Hugging Face
- **Streaming by default** — tokens print as they arrive
- **Pipe-friendly** — reads from stdin, writes to stdout, errors to stderr
- **JSON output** — structured response with usage and finish reason
- **Config directory** — set defaults in `~/.ai-pipe/`
- **Shell completions** — bash, zsh, fish
- **Standalone binary** — compile to a single executable with `bun build --compile`

## Install

```sh
bun install -g ai-pipe
```

This installs both `ai-pipe` and `ai` as CLI commands.

Or run without installing:

```sh
bunx ai-pipe "explain monads in one sentence"
```

Also available via npm:

```sh
npm install -g ai-pipe
```

### From source

```sh
git clone https://github.com/andrew-bierman/ai-pipe.git
cd ai-pipe
bun install
bun link
```

## Setup

Set an API key for at least one provider:

```sh
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENROUTER_API_KEY="sk-or-..."
export AZURE_AI_API_KEY="..."
export TOGETHERAI_API_KEY="..."
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export GOOGLE_VERTEX_PROJECT="my-project"
export GOOGLE_VERTEX_LOCATION="us-central1"
export HF_TOKEN="hf_..."

# Ollama (local)
export OLLAMA_HOST="http://localhost:11434"
```

Run `ai-pipe --providers` to see which keys are configured.

## Usage

```sh
# Ask a question
ai-pipe "explain monads in one sentence"

# Pipe content
cat main.go | ai-pipe "review this code"
echo "hello world" | ai-pipe "translate to French"

# Pick a provider and model
ai-pipe -m anthropic/claude-sonnet-4-5 "write a haiku"
ai-pipe -m google/gemini-2.5-flash "summarize this" < article.txt

# Set a system prompt
ai-pipe -s "you are a senior Go developer" "review this PR" < diff.txt

# Get JSON output
ai-pipe --json "what is 2+2"

# Disable streaming
ai-pipe --no-stream "list 3 colors"

# Adjust temperature
ai-pipe -t 1.5 "write a creative story"

# Limit output length
ai-pipe --max-output-tokens 100 "explain quantum computing"
```

If no `provider/` prefix is given, the model defaults to `openai`. If no `-m` flag is given, it defaults to `openai/gpt-4o`.

## Providers

| Provider | Env Variable | Example Model |
|---|---|---|
| openai | `OPENAI_API_KEY` | `openai/gpt-4o` |
| anthropic | `ANTHROPIC_API_KEY` | `anthropic/claude-sonnet-4-5` |
| google | `GOOGLE_GENERATIVE_AI_API_KEY` | `google/gemini-2.5-flash` |
| perplexity | `PERPLEXITY_API_KEY` | `perplexity/sonar` |
| xai | `XAI_API_KEY` | `xai/grok-3` |
| mistral | `MISTRAL_API_KEY` | `mistral/mistral-large-latest` |
| groq | `GROQ_API_KEY` | `groq/llama-3.3-70b-versatile` |
| deepseek | `DEEPSEEK_API_KEY` | `deepseek/deepseek-chat` |
| cohere | `COHERE_API_KEY` | `cohere/command-r-plus` |
| openrouter | `OPENROUTER_API_KEY` | `openrouter/openrouter` |
| azure | `AZURE_AI_API_KEY` | `azure/azure-model-id` |
| togetherai | `TOGETHERAI_API_KEY` | `togetherai/meta-llama/Llama-3.3-70b-Instruct` |
| bedrock | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | `bedrock/anthropic.claude-sonnet-4-2025-02-19` |
| vertex | `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION` | `vertex/google/cloud/llama-3.1` |
| ollama | `OLLAMA_HOST` | `ollama/llama3` |
| huggingface | `HF_TOKEN` | `huggingface/meta-llama/Llama-3.3-70b-Instruct` |

## Config Directory

Create `~/.ai-pipe/` with two optional files:

**`~/.ai-pipe/config.json`** — settings:

```json
{
  "model": "anthropic/claude-sonnet-4-5",
  "system": "Be concise.",
  "temperature": 0.7,
  "maxOutputTokens": 1000
}
```

**`~/.ai-pipe/apiKeys.json`** — API keys:

```json
{
  "anthropic": "sk-ant-...",
  "openai": "sk-..."
}
```

API keys in `apiKeys.json` work as an alternative to environment variables. Environment variables always take precedence.

Use a custom config directory with `-c`:

```sh
ai-pipe -c ./my-config-dir "hello"
```

CLI flags always override config values.

## Shell Completions

```sh
# bash — add to ~/.bashrc
eval "$(ai-pipe --completions bash)"

# zsh — add to ~/.zshrc
eval "$(ai-pipe --completions zsh)"

# fish — save to completions dir
ai-pipe --completions fish > ~/.config/fish/completions/ai-pipe.fish
```

## JSON Output

Use `--json` to get structured output:

```json
{
  "text": "2 + 2 = 4",
  "model": "openai/gpt-4o",
  "usage": {
    "inputTokens": 12,
    "outputTokens": 8,
    "totalTokens": 20
  },
  "finishReason": "stop"
}
```

Pipe into `jq` for further processing:

```sh
ai-pipe --json "list 3 colors" | jq -r '.text'
```

## Flags

```
Usage: ai-pipe [options] [prompt...]

Options:
  -m, --model <model>          Model in provider/model-id format
  -s, --system <prompt>        System prompt
  -j, --json                   Output full JSON response object
  --no-stream                  Wait for full response, then print
  -t, --temperature <n>        Sampling temperature (0-2)
  --max-output-tokens <n>      Maximum tokens to generate
  -c, --config <path>          Path to config directory
  --providers                  List supported providers and their API key status
  --completions <shell>        Generate shell completions (bash, zsh, fish)
  -V, --version                Print version
  -h, --help                   Print help
```

## Build

Compile to a standalone binary:

```sh
# Current platform
bun run build

# Cross-platform
bun run build:mac        # macOS ARM
bun run build:mac-x64    # macOS Intel
bun run build:linux      # Linux x64
bun run build:linux-arm  # Linux ARM
bun run build:all        # All targets
```

Binaries are output to `dist/`.

## Development

```sh
bun install
bun test              # 211 tests across 7 files
bun run typecheck     # TypeScript type checking
```

## Roadmap

- **Conversation history** — continue previous conversations with `-C`, named sessions with `--session`
- **Image input** — attach images for vision models with `--image`
- **File attachments** — include file contents in prompts with `-f`
- **Roles** — saved system prompts in `~/.ai-pipe/roles/` (e.g. `ai-pipe --role reviewer`)
- **Markdown rendering** — syntax-highlighted, formatted output in the terminal
- **Cost tracking** — show estimated token costs per request
- **Response caching** — skip duplicate API calls for identical prompts
- **Tool use** — function calling and MCP support

## License

GPL-3.0 — see [LICENSE](LICENSE) for details.
