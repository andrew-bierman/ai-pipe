# ai-pipe

<div align="center">

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-yellow.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3.5-black.svg)](https://bun.sh/)

</div>

A powerful CLI for calling LLMs from the terminal. Text in, text out. Built on the [Vercel AI SDK](https://sdk.vercel.ai/) with [Bun](https://bun.sh/).

## ✨ Features

- 🤖 **17+ AI Providers** — OpenAI, Anthropic, Google, Perplexity, xAI, Mistral, Groq, DeepSeek, Cohere, OpenRouter, Azure AI, Together AI, Amazon Bedrock, Google Vertex AI, Ollama, Hugging Face, DeepInfra
- 📡 **Streaming by Default** — tokens print as they arrive
- 🔄 **Pipe-friendly** — reads from stdin, writes to stdout, errors to stderr
- 📎 **File Attachments** — include file contents in prompts with `-f`
- 📋 **JSON Output** — structured response with usage and finish reason
- ⚙️ **Config Directory** — set defaults in `~/.ai-pipe/`
- 🐚 **Shell Completions** — bash, zsh, fish
- 📦 **Standalone Binary** — compile to a single executable with `bun build --compile`

## 📦 Installation

```sh
bun install -g ai-pipe
```

This installs both `ai-pipe` and `ai` as CLI commands.

Or run without installing:

```sh
bunx ai-pipe "explain monads in one sentence"
```

Also available via npm (requires [Bun](https://bun.sh/) at runtime):

```sh
npm install -g ai-pipe
npx ai-pipe "explain monads in one sentence"
```

### From source

```bash
git clone https://github.com/andrew-bierman/ai-pipe.git
cd ai-pipe
bun install
bun link
```

## 🔑 Setup

Set an API key for at least one provider:

```bash
# OpenAI
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# OpenRouter
export OPENROUTER_API_KEY="sk-or-..."

# Azure AI
export AZURE_AI_API_KEY="..."

# Together AI
export TOGETHERAI_API_KEY="..."

# AWS (for Bedrock)
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."

# Google Vertex AI
export GOOGLE_VERTEX_PROJECT="my-project"
export GOOGLE_VERTEX_LOCATION="us-central1"

# Hugging Face
export HF_TOKEN="hf_..."

# Ollama (local)
export OLLAMA_HOST="http://localhost:11434"

# DeepInfra
export DEEPINFRA_API_KEY="..."
```

> 💡 **Tip:** Run `ai-pipe --providers` to see which keys are configured.

## 🚀 Usage

### Basic Usage

```bash
# Ask a question
ai-pipe "What is TypeScript?"

# Streaming response
ai-pipe "Write a poem about coding"

# Pipe content
cat main.go | ai-pipe "review this code"
echo "hello world" | ai-pipe "translate to French"
```

### Advanced Options

```bash
# Specify provider and model
ai-pipe -m anthropic/claude-sonnet-4-5 "write a haiku"
ai-pipe -m google/gemini-2.5-flash "summarize this" < article.txt

# Include file contents
ai-pipe -f main.go "review this code"
ai-pipe -f src/app.ts -f src/utils.ts "find bugs"

# Set system prompt
ai-pipe -s "you are a senior Go developer" "review this PR" < diff.txt

# JSON output
ai-pipe --json "what is 2+2"

# Disable streaming
ai-pipe --no-stream "list 3 colors"

# Adjust temperature
ai-pipe -t 1.5 "write a creative story"

# Limit output length
ai-pipe --max-output-tokens 100 "explain quantum computing"
```

> 📌 **Note:** If no `provider/` prefix is given, the model defaults to `openai`. If no `-m` flag is given, it defaults to `openai/gpt-4o`.

### Available Providers

| Provider | Env Variable | Example Model |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | `openai/gpt-4o` |
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic/claude-sonnet-4-5` |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | `google/gemini-2.5-flash` |
| Perplexity | `PERPLEXITY_API_KEY` | `perplexity/sonar` |
| xAI | `XAI_API_KEY` | `xai/grok-3` |
| Mistral | `MISTRAL_API_KEY` | `mistral/mistral-large-latest` |
| Groq | `GROQ_API_KEY` | `groq/llama-3.3-70b-versatile` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek/deepseek-chat` |
| Cohere | `COHERE_API_KEY` | `cohere/command-r-plus` |
| OpenRouter | `OPENROUTER_API_KEY` | `openrouter/openrouter` |
| Azure | `AZURE_AI_API_KEY` | `azure/azure-model-id` |
| TogetherAI | `TOGETHERAI_API_KEY` | `togetherai/meta-llama/Llama-3.3-70b-Instruct` |
| Bedrock | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | `bedrock/anthropic.claude-sonnet-4-2025-02-19` |
| Vertex | `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION` | `vertex/google/cloud/llama-3.1` |
| Ollama | `OLLAMA_HOST` | `ollama/llama3` |
| HuggingFace | `HF_TOKEN` | `huggingface/meta-llama/Llama-3.3-70b-Instruct` |
| DeepInfra | `DEEPINFRA_API_KEY` | `deepinfra/meta-llama/Llama-3.3-70B-Instruct` |

## ⚙️ Configuration

### Config Directory

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

```bash
ai-pipe -c ./my-config-dir "hello"
```

> 🔧 **Note:** CLI flags always override config values.

### Shell Completions

```bash
# bash — add to ~/.bashrc
eval "$(ai-pipe --completions bash)"

# zsh — add to ~/.zshrc
eval "$(ai-pipe --completions zsh)"

# fish — save to completions dir
ai-pipe --completions fish > ~/.config/fish/completions/ai-pipe.fish
```

## 📊 JSON Output

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

```bash
ai-pipe --json "list 3 colors" | jq -r '.text'
```

## 🛠️ Command Options

```
Usage: ai-pipe [options] [prompt...]

Options:
  -m, --model <model>          Model in provider/model-id format
  -s, --system <prompt>        System prompt
  -f, --file <path>            Include file contents in prompt (repeatable)
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

## 📦 Building & Distribution

Compile to a standalone binary:

```bash
# Current platform
bun run build

# Cross-platform builds
bun run build:mac        # macOS ARM
bun run build:mac-x64    # macOS Intel
bun run build:linux      # Linux x64
bun run build:linux-arm  # Linux ARM
bun run build:all        # All targets
```

Binaries are output to `dist/`.

## 🧪 Development

```bash
# Install dependencies
bun install

# Run tests
bun test              # 227 tests across 7 files

# Type checking
bun run typecheck     # TypeScript type checking
```

## 🚀 Releasing

1. `bun pm version patch` (or `minor` / `major`)
2. `git push --follow-tags`

The release workflow handles `bun publish`, binary builds, and GitHub release.

## 🗺️ Roadmap

- [x] **Streaming by default** — tokens print as they arrive
- [x] **Pipe-friendly** — reads from stdin, writes to stdout, errors to stderr
- [x] **JSON output** — structured response with usage and finish reason
- [x] **Config directory** — set defaults in `~/.ai-pipe/`
- [x] **Shell completions** — bash, zsh, fish
- [x] **Standalone binary** — compile to a single executable with `bun build --compile`
- [x] **16 providers** — OpenAI, Anthropic, Google, and 14 more
- [x] **npm publishing** — `npm install -g ai-pipe` / `bun install -g ai-pipe`
- [x] **File attachments** — include file contents in prompts with `-f`
- [ ] **Conversation history** — continue previous conversations with `-C`, named sessions with `--session`
- [ ] **Image input** — attach images for vision models with `--image`
- [ ] **Roles** — saved system prompts in `~/.ai-pipe/roles/` (e.g. `ai-pipe --role reviewer`)
- [ ] **Markdown rendering** — syntax-highlighted, formatted output in the terminal
- [ ] **Cost tracking** — show estimated token costs per request
- [ ] **Response caching** — skip duplicate API calls for identical prompts
- [ ] **Tool use** — function calling and MCP support

## 📚 Documentation

- [API Reference](docs/api.md)
- [Provider Configuration](docs/providers.md)
- [Examples](examples/)
- [Contributing Guide](CONTRIBUTING.md)

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Vercel](https://vercel.com/) for the amazing AI SDK
- [Bun](https://bun.sh/) for the fast JavaScript runtime
- All our amazing contributors and users!

---

<div align="center">

**Built with ❤️ using ai-pipe**

</div>
