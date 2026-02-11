# Providers

`ai-pipe` supports 18 AI providers through the [Vercel AI SDK](https://sdk.vercel.ai/). Each provider requires one or more environment variables (or entries in `~/.ai-pipe/apiKeys.json`).

## Quick Start

Set at least one provider's API key, then use the `provider/model-id` format:

```bash
export OPENAI_API_KEY="sk-..."
ai-pipe -m openai/gpt-4o "hello"
```

If you omit the provider prefix, `openai` is assumed:

```bash
ai-pipe -m gpt-4o "hello"       # same as openai/gpt-4o
ai-pipe "hello"                  # uses default: openai/gpt-4o
```

## All Providers

### OpenAI

| | |
|---|---|
| **Env Variable** | `OPENAI_API_KEY` |
| **Model Format** | `openai/<model-id>` |
| **Sign Up** | https://platform.openai.com/api-keys |

```bash
export OPENAI_API_KEY="sk-..."

ai-pipe -m openai/gpt-4o "explain monads"
ai-pipe -m openai/gpt-4o-mini "quick question"
ai-pipe -m openai/gpt-4.5-preview "deep analysis"
ai-pipe -m openai/o1 "reason about this problem"
ai-pipe -m openai/o3-mini "fast reasoning"
```

### Anthropic

| | |
|---|---|
| **Env Variable** | `ANTHROPIC_API_KEY` |
| **Model Format** | `anthropic/<model-id>` |
| **Sign Up** | https://console.anthropic.com/ |

```bash
export ANTHROPIC_API_KEY="sk-ant-..."

ai-pipe -m anthropic/claude-sonnet-4-5 "write clean code"
ai-pipe -m anthropic/claude-sonnet-4 "review this PR"
ai-pipe -m anthropic/claude-opus-4-20250514 "complex analysis"
ai-pipe -m anthropic/claude-haiku-3-20250514 "quick summary"
```

### Google (Gemini)

| | |
|---|---|
| **Env Variable** | `GOOGLE_GENERATIVE_AI_API_KEY` |
| **Model Format** | `google/<model-id>` |
| **Sign Up** | https://aistudio.google.com/apikey |

```bash
export GOOGLE_GENERATIVE_AI_API_KEY="AIza..."

ai-pipe -m google/gemini-2.5-pro "analyze this codebase"
ai-pipe -m google/gemini-2.5-flash "quick answer"
ai-pipe -m google/gemini-1.5-pro "summarize this document"
ai-pipe -m google/gemini-1.5-flash "translate to Spanish"
```

### Perplexity

| | |
|---|---|
| **Env Variable** | `PERPLEXITY_API_KEY` |
| **Model Format** | `perplexity/<model-id>` |
| **Sign Up** | https://www.perplexity.ai/settings/api |

```bash
export PERPLEXITY_API_KEY="pplx-..."

ai-pipe -m perplexity/sonar "what happened in tech today"
ai-pipe -m perplexity/sonar-pro "detailed research on topic"
ai-pipe -m perplexity/sonar-deep-research "deep dive analysis"
```

**Note:** Perplexity models have built-in web search and return grounded, cited responses.

### xAI (Grok)

| | |
|---|---|
| **Env Variable** | `XAI_API_KEY` |
| **Model Format** | `xai/<model-id>` |
| **Sign Up** | https://console.x.ai/ |

```bash
export XAI_API_KEY="xai-..."

ai-pipe -m xai/grok-3 "explain this concept"
ai-pipe -m xai/grok-3-mini "quick question"
ai-pipe -m xai/grok-2 "general knowledge"
```

### Mistral

| | |
|---|---|
| **Env Variable** | `MISTRAL_API_KEY` |
| **Model Format** | `mistral/<model-id>` |
| **Sign Up** | https://console.mistral.ai/api-keys/ |

```bash
export MISTRAL_API_KEY="..."

ai-pipe -m mistral/mistral-large-latest "complex reasoning"
ai-pipe -m mistral/mistral-medium "balanced task"
ai-pipe -m mistral/mistral-small "quick task"
ai-pipe -m mistral/open-mistral-7b "free tier model"
```

### Groq

| | |
|---|---|
| **Env Variable** | `GROQ_API_KEY` |
| **Model Format** | `groq/<model-id>` |
| **Sign Up** | https://console.groq.com/keys |

```bash
export GROQ_API_KEY="gsk_..."

ai-pipe -m groq/llama-3.3-70b-versatile "general purpose"
ai-pipe -m groq/llama-3.1-8b-instant "ultra fast"
ai-pipe -m groq/llama-3.3-70b-specdec "speculative decoding"
ai-pipe -m groq/mixtral-8x7b-32768 "large context"
```

**Note:** Groq provides extremely fast inference on open-source models.

### DeepSeek

| | |
|---|---|
| **Env Variable** | `DEEPSEEK_API_KEY` |
| **Model Format** | `deepseek/<model-id>` |
| **Sign Up** | https://platform.deepseek.com/ |

```bash
export DEEPSEEK_API_KEY="sk-..."

ai-pipe -m deepseek/deepseek-chat "general conversation"
ai-pipe -m deepseek/deepseek-reasoner "step-by-step reasoning"
```

### Cohere

| | |
|---|---|
| **Env Variable** | `COHERE_API_KEY` |
| **Model Format** | `cohere/<model-id>` |
| **Sign Up** | https://dashboard.cohere.com/api-keys |

```bash
export COHERE_API_KEY="..."

ai-pipe -m cohere/command-r-plus "complex generation"
ai-pipe -m cohere/command-r "general tasks"
```

### Fireworks

| | |
|---|---|
| **Env Variable** | `FIREWORKS_API_KEY` |
| **Model Format** | `fireworks/<model-id>` |
| **Sign Up** | https://fireworks.ai/account/api-keys |

```bash
export FIREWORKS_API_KEY="fw_..."

ai-pipe -m fireworks/accounts/fireworks/models/deepseek-v3 "fast inference"
```

### OpenRouter

| | |
|---|---|
| **Env Variable** | `OPENROUTER_API_KEY` |
| **Model Format** | `openrouter/<model-id>` |
| **Sign Up** | https://openrouter.ai/keys |

```bash
export OPENROUTER_API_KEY="sk-or-..."

ai-pipe -m openrouter/anthropic/claude-sonnet-4-5 "via openrouter"
ai-pipe -m openrouter/openai/gpt-4o "route through openrouter"
ai-pipe -m openrouter/google/gemini-2.5-pro "any provider via openrouter"
```

**Note:** OpenRouter acts as a gateway to many providers. Pricing depends on the underlying model. Use it to access multiple providers with a single API key.

### Azure AI

| | |
|---|---|
| **Env Variable** | `AZURE_AI_API_KEY` |
| **Model Format** | `azure/<deployment-id>` |
| **Sign Up** | https://portal.azure.com/ |

```bash
export AZURE_AI_API_KEY="..."

ai-pipe -m azure/my-gpt4-deployment "enterprise query"
```

**Note:** Azure model IDs correspond to your deployment names, not standard model names.

### Together AI

| | |
|---|---|
| **Env Variable** | `TOGETHERAI_API_KEY` |
| **Model Format** | `togetherai/<model-id>` |
| **Sign Up** | https://api.together.xyz/settings/api-keys |

```bash
export TOGETHERAI_API_KEY="..."

ai-pipe -m togetherai/meta-llama/Llama-3.3-70b-Instruct "open source model"
ai-pipe -m togetherai/meta-llama/Llama-3.1-405b-instruct "largest llama"
```

### Amazon Bedrock

| | |
|---|---|
| **Env Variables** | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| **Model Format** | `bedrock/<model-id>` |
| **Sign Up** | https://console.aws.amazon.com/bedrock/ |

```bash
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="..."

ai-pipe -m bedrock/anthropic.claude-sonnet-4-2025-02-19 "via bedrock"
```

**Note:** Both `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` must be set. Pricing varies by region.

### Google Vertex AI

| | |
|---|---|
| **Env Variables** | `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION` |
| **Model Format** | `vertex/<model-id>` |
| **Sign Up** | https://console.cloud.google.com/vertex-ai |

```bash
export GOOGLE_VERTEX_PROJECT="my-project-id"
export GOOGLE_VERTEX_LOCATION="us-central1"

ai-pipe -m vertex/gemini-2.5-pro "via vertex"
```

**Note:** Both env vars are required. This uses Google Cloud authentication, which may also require `gcloud auth` or a service account.

### Ollama (Local)

| | |
|---|---|
| **Env Variable** | `OLLAMA_HOST` |
| **Model Format** | `ollama/<model-name>` |
| **Install** | https://ollama.com/ |

```bash
export OLLAMA_HOST="http://localhost:11434"

# First, pull a model with Ollama
ollama pull llama3
ollama pull codellama
ollama pull mistral

# Then use it
ai-pipe -m ollama/llama3 "hello"
ai-pipe -m ollama/codellama "review this code"
ai-pipe -m ollama/mistral "explain this concept"
```

**Note:** Ollama runs models locally. No API key needed -- just the host URL. Free to use, limited by your hardware.

### Hugging Face

| | |
|---|---|
| **Env Variable** | `HF_TOKEN` |
| **Model Format** | `huggingface/<model-id>` |
| **Sign Up** | https://huggingface.co/settings/tokens |

```bash
export HF_TOKEN="hf_..."

ai-pipe -m huggingface/meta-llama/Llama-3.3-70b-Instruct "open source"
```

### DeepInfra

| | |
|---|---|
| **Env Variable** | `DEEPINFRA_API_KEY` |
| **Model Format** | `deepinfra/<model-id>` |
| **Sign Up** | https://deepinfra.com/dash/api_keys |

```bash
export DEEPINFRA_API_KEY="..."

ai-pipe -m deepinfra/meta-llama/Llama-3.3-70b-Instruct "fast open source"
```

## Checking Provider Status

Run `--providers` to see which API keys are configured in your environment:

```bash
ai-pipe --providers
```

Output:

```
Provider      Env Variable(s)                            Status
────────      ───────────────                            ──────
openai        OPENAI_API_KEY                             ✓ set
anthropic     ANTHROPIC_API_KEY                          ✓ set
google        GOOGLE_GENERATIVE_AI_API_KEY               ✗ missing
perplexity    PERPLEXITY_API_KEY                         ✗ missing
xai           XAI_API_KEY                                ✗ missing
mistral       MISTRAL_API_KEY                            ✗ missing
groq          GROQ_API_KEY                               ✓ set
deepseek      DEEPSEEK_API_KEY                           ✗ missing
cohere        COHERE_API_KEY                             ✗ missing
fireworks     FIREWORKS_API_KEY                          ✗ missing
openrouter    OPENROUTER_API_KEY                         ✗ missing
azure         AZURE_AI_API_KEY                           ✗ missing
togetherai    TOGETHERAI_API_KEY                         ✗ missing
bedrock       AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY   ✗ missing
vertex        GOOGLE_VERTEX_PROJECT, GOOGLE_VERTEX_LOCATION  ✗ missing
ollama        OLLAMA_HOST                                ✗ missing
huggingface   HF_TOKEN                                   ✗ missing
deepinfra     DEEPINFRA_API_KEY                          ✗ missing
```

## Pricing Table

Prices are per 1 million tokens (as of early 2025). Providers may change prices at any time. Use `--cost` to see estimated costs for each request.

### OpenAI

| Model | Input ($/1M) | Output ($/1M) |
|-------|-------------|---------------|
| gpt-4o | $2.50 | $10.00 |
| gpt-4o-mini | $0.15 | $0.60 |
| gpt-4.5-preview | $10.00 | $30.00 |
| o1 | $15.00 | $60.00 |
| o1-mini | $1.10 | $4.40 |
| o3-mini | $1.10 | $4.40 |

### Anthropic

| Model | Input ($/1M) | Output ($/1M) |
|-------|-------------|---------------|
| claude-sonnet-4-5 | $3.00 | $15.00 |
| claude-sonnet-4 | $3.00 | $15.00 |
| claude-opus-4-20250514 | $15.00 | $75.00 |
| claude-haiku-3-20250514 | $0.25 | $1.25 |

### Google

| Model | Input ($/1M) | Output ($/1M) |
|-------|-------------|---------------|
| gemini-2.5-pro | $1.25 | $10.00 |
| gemini-2.5-flash | $0.075 | $0.30 |
| gemini-1.5-pro | $1.25 | $5.00 |
| gemini-1.5-flash | $0.075 | $0.30 |
| gemini-pro | $0.50 | $1.50 |

### Perplexity

| Model | Input ($/1M) | Output ($/1M) |
|-------|-------------|---------------|
| sonar | $1.00 | $5.00 |
| sonar-pro | $5.00 | $20.00 |
| sonar-deep-research | $30.00 | $40.00 |

### xAI

| Model | Input ($/1M) | Output ($/1M) |
|-------|-------------|---------------|
| grok-3 | $3.00 | $15.00 |
| grok-3-mini | $0.50 | $0.50 |
| grok-2 | $2.00 | $10.00 |

### Mistral

| Model | Input ($/1M) | Output ($/1M) |
|-------|-------------|---------------|
| mistral-large-latest | $2.00 | $6.00 |
| mistral-medium | $0.50 | $1.50 |
| mistral-small | $0.10 | $0.50 |
| open-mistral-7b | Free | Free |

### Groq

| Model | Input ($/1M) | Output ($/1M) |
|-------|-------------|---------------|
| llama-3.3-70b-versatile | $0.59 | $0.79 |
| llama-3.1-8b-instant | $0.04 | $0.04 |
| llama-3.3-70b-specdec | $0.59 | $0.79 |
| mixtral-8x7b-32768 | $0.24 | $0.24 |

### DeepSeek

| Model | Input ($/1M) | Output ($/1M) |
|-------|-------------|---------------|
| deepseek-chat | $0.14 | $0.28 |
| deepseek-reasoner | $0.55 | $2.19 |

### Cohere

| Model | Input ($/1M) | Output ($/1M) |
|-------|-------------|---------------|
| command-r-plus | $3.00 | $15.00 |
| command-r | $0.50 | $1.50 |

### Together AI

| Model | Input ($/1M) | Output ($/1M) |
|-------|-------------|---------------|
| meta-llama/Llama-3.3-70b-Instruct | $0.90 | $0.90 |
| meta-llama/Llama-3.1-405b-instruct | $5.00 | $5.00 |

### Other Providers

| Provider | Default Input ($/1M) | Default Output ($/1M) | Notes |
|----------|---------------------|----------------------|-------|
| Fireworks | $0.30 | $1.00 | |
| Azure | $2.50 | $10.00 | Varies by deployment |
| Bedrock | $2.50 | $10.00 | Varies by region |
| Vertex | $2.50 | $10.00 | Varies by region |
| DeepInfra | $0.30 | $0.60 | |
| OpenRouter | Varies | Varies | Depends on underlying model |
| Ollama | Free | Free | Runs locally |
| Hugging Face | Free | Free | Inference API |

## Cost Tracking

Use the `--cost` flag to see estimated costs after each request:

```bash
ai-pipe --cost "explain quantum computing"
```

Output on stderr:

```
💰 Cost: $0.0003 (120 in) + $0.0050 (500 out) = $0.0053
```

Combine with `--json` to keep stdout clean:

```bash
ai-pipe --json --cost "explain quantum computing" > response.json
```

The cost estimate is always printed to stderr, so it never interferes with piped output.

## API Key Storage

You can store API keys in two ways:

### 1. Environment Variables (Recommended)

```bash
# In your shell profile (~/.bashrc, ~/.zshrc, etc.)
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
```

### 2. Config File

```json
// ~/.ai-pipe/apiKeys.json
{
  "openai": "sk-...",
  "anthropic": "sk-ant-...",
  "google": "AIza..."
}
```

**Priority:** Environment variables always take precedence over `apiKeys.json`. If both are set, the environment variable wins.
