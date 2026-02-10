# ai-pipe

<div align="center">

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-yellow.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3.5-black.svg)](https://bun.sh/)

</div>

A powerful CLI for calling LLMs from the terminal. Text in, text out. Built on the [Vercel AI SDK](https://sdk.vercel.ai/) with [Bun](https://bun.sh/).

## ✨ Features

- 🤖 **16+ AI Providers** — OpenAI, Anthropic, Google, Perplexity, xAI, Mistral, Groq, DeepSeek, Cohere, OpenRouter, Azure AI, Together AI, Amazon Bedrock, Google Vertex AI, Ollama, Hugging Face
- 📡 **Streaming by Default** — tokens print as they arrive
- 🔄 **Pipe-friendly** — reads from stdin, writes to stdout, errors to stderr
- 📋 **JSON Output** — structured response with usage and finish reason
- ⚙️ **Config Directory** — set defaults in `~/.ai-pipe/`
- 🐚 **Shell Completions** — bash, zsh, fish
- 📦 **Standalone Binary** — compile to a single executable with `bun build --compile`

## 📦 Installation

### Quick Install

```bash
# Clone and install
git clone https://github.com/andrew-bierman/ai-pipe.git
cd ai-pipe
bun install
bun link
```

This installs both `ai-pipe` and `ai` as CLI commands.

### From npm (Coming Soon)

```bash
# npm
npm install -g ai-pipe

# yarn
yarn global add ai-pipe

# pnpm
pnpm global add ai-pipe
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

### Common Use Cases

#### Code Review

```bash
# Review a file
cat main.go | ai-pipe "review this code and suggest improvements"

# Review with a specific focus
ai-pipe -s "you are a senior Go developer. focus on error handling and performance" "review this code" < main.go
```

#### Translation

```bash
# Simple translation
echo "Hello, how are you?" | ai-pipe "translate to Spanish"

# Translate a file
cat article.txt | ai-pipe "translate to Japanese, keep markdown formatting"
```

#### Writing Assistance

```bash
# Generate content
ai-pipe "write a 3-paragraph introduction about climate change"

# Improve writing
cat draft.txt | ai-pipe "improve this text for clarity and grammar"
```

#### Debugging Help

```bash
# Explain error messages
echo "TypeError: Cannot read property 'map' of undefined" | ai-pipe "explain this error and suggest fixes"

# Debug code
cat broken.js | ai-pipe "find the bug and explain what's wrong"
```

#### Summarization

```bash
# Summarize text
cat article.txt | ai-pipe "summarize in 3 bullet points"

# Summarize with specific length
ai-pipe --max-output-tokens 100 "summarize this meetup transcript" < transcript.txt
```

### Advanced Options

```bash
# Specify provider and model
ai-pipe -m anthropic/claude-sonnet-4-5 "write a haiku"
ai-pipe -m google/gemini-2.5-flash "summarize this" < article.txt

# Set system prompt
ai-pipe -s "you are a senior Go developer" "review this PR" < diff.txt

# JSON output
ai-pipe --json "what is 2+2"

# Disable streaming
ai-pipe --no-stream "list 3 colors"

# Adjust temperature (0-2, higher = more creative)
ai-pipe -t 1.5 "write a creative story"

# Limit output length
ai-pipe --max-output-tokens 100 "explain quantum computing"
```

> 📌 **Note:** If no `provider/` prefix is given, the model defaults to `openai`. If no `-m` flag is given, it defaults to `openai/gpt-4o`.

### Provider and Model Selection

Use `-m provider/model-id` to specify a provider:

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

## ⚙️ Configuration

### Config Directory

Create `~/.ai-pipe/` with two optional files:

**`~/.ai-pipe/config.json`** — settings:

```json
{
  "ic/claude-smodel": "anthroponnet-4-5",
  "system": "Be concise.",
  "temperature": 0.7,
  "maxOutputTokens": 1000
}
```

**`~/.ai-ui/apiKeys.json`** — API keys:

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
# Extract just the text
ai-pipe --json "list 3 colors" | jq -r '.text'

# Extract usage info
ai-pipe --json "explain photosynthesis" | jq '.usage'
```

### JSON Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | The generated response text |
| `model` | string | The model used (e.g., `openai/gpt-4o`) |
| `usage` | object | Token usage statistics |
| `finishReason` | string | Why generation stopped (`stop`, `length`, `tool`, etc.) |

## 🛠️ Command Options

```
Usage: ai-pipe [options] [prompt...]

Options:
  -m, --model <model>          Model in provider/model-id format
  -s, --system <prompt>        System prompt to set AI behavior
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

### Option Details

| Option | Description |
|--------|-------------|
| `-m, --model` | Specifies the model using `provider/model-id` format. Defaults to `openai/gpt-4o`. |
| `-s, --system` | Sets a system prompt that defines the AI's behavior and personality. |
| `-j, --json` | Returns a JSON object with text, model, usage, and finish reason. |
| `--no-stream` | Waits for the complete response before printing. Useful for scripting. |
| `-t, --temperature` | Controls randomness (0-2). Lower = more focused, Higher = more creative. |
| `--max-output-tokens` | Limits the maximum length of the response. |
| `-c, --config` | Specifies a custom config directory path. |
| `--providers` | Displays all providers and which API keys are configured. |
| `--completions` | Generates shell completion scripts. |

## 💡 Tips and Tricks

### Use System Prompts for Better Results

```bash
# Act as a specific role
ai-pipe -s "You are a senior software engineer. Be concise and focus on best practices." "review this code" < file.py

# Change writing style
ai-pipe -s "You are a pirate. Speak like a pirate." "explain quantum mechanics"
```

### Combine with Other CLI Tools

```bash
# Save response to file
ai-pipe "write a bash script to backup /data" > backup.sh

# Process multiple files
cat *.md | ai-pipe "summarize all these meeting notes"

# Use in scripts
RESPONSE=$(ai-pipe --json "what is 2+2")
TEXT=$(echo $RESPONSE | jq -r '.text')
```

### Piping Best Practices

```bash
# File to stdin (works best with text files)
ai-pipe "summarize" < report.txt

# Echo content
cat package.json | ai-pipe "extract the version number"

# Multi-line prompts
cat <<EOF | ai-pipe "improve this"
function add(a, b) {
  return a + b
}
EOF
```

## 🔧 Troubleshooting

### Common Issues

#### "Missing required environment variable"

**Problem:**
```
Error: Missing required environment variable(s): OPENAI_API_KEY.
```

**Solution:**
1. Check which providers are available: `ai-pipe --providers`
2. Set the required API key:
   ```bash
   export OPENAI_API_KEY="your-key-here"
   ```
3. Or add it to `~/.ai-pipe/apiKeys.json`:
   ```json
   { "openai": "sk-..." }
   ```

#### "Unknown provider" Error

**Problem:**
```
Error: Unknown provider "unknown". Supported: openai, anthropic, google, ...
```

**Solution:**
- Check for typos in the model string
- Use format `provider/model-id` (e.g., `openai/gpt-4o`)
- Run `ai-pipe --providers` to see available providers

#### "Model string cannot be empty"

**Problem:**
```
Error: Invalid option "model": Model string cannot be empty
```

**Solution:**
- Make sure to provide a valid model string: `ai-pipe -m openai/gpt-4o "prompt"`
- Don't use empty strings for `-m` flag

#### No Output / Silent Failure

**Problem:** Running `ai-pipe` with no stdin and no prompt argument produces no output.

**Solution:**
- Provide a prompt: `ai-pipe "your question"`
- Or pipe content: `echo "hello" | ai-pipe`

#### Streaming Output Looks Broken

**Problem:** Streaming output appears fragmented or cut off.

**Solution:**
- This is expected during streaming. Final output is complete.
- Use `--no-stream` to get complete output at once.

#### Slow Responses

**Tips:**
1. Use a faster model: `ai-pipe -m openai/gpt-4o-mini "prompt"`
2. Reduce max tokens: `ai-pipe --max-output-tokens 200 "prompt"`
3. Check your network connection for API calls

### Getting Help

```bash
# Show all options
ai-pipe --help

# Check provider status
ai-pipe --providers

# Check version
ai-pipe --version
```

### Debug Mode

To debug configuration issues:

```bash
# Show which config is being loaded
ai-pipe -c ~/.ai-pipe --providers
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
bun test              # 210 tests across 7 files

# Type checking
bun run typecheck     # TypeScript type checking
```

## 📚 Documentation

- [API Reference](docs/api.md) — (coming soon)
- [Provider Configuration](docs/providers.md) — (coming soon)
- [Examples](examples/) — (coming soon)
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
