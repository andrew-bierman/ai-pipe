# Configuration

`ai-pipe` uses a config directory at `~/.ai-pipe/` to store settings, API keys, roles, and session history. Everything is optional -- you can use `ai-pipe` with just environment variables and CLI flags.

## Directory Structure

```
~/.ai-pipe/
├── config.json          # Default settings (model, system prompt, temperature, etc.)
├── apiKeys.json         # API keys for providers
├── roles/               # System prompt templates
│   ├── reviewer.md
│   ├── writer.md
│   └── translator.md
└── history/             # Session conversation history
    ├── chat.json
    ├── work.json
    └── project-x.json
```

## config.json

Default settings that apply when CLI flags are not provided.

### Full Schema

```json
{
  "model": "anthropic/claude-sonnet-4-5",
  "system": "Be concise and direct.",
  "temperature": 0.7,
  "maxOutputTokens": 2000
}
```

### Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `model` | string | `openai/gpt-4o` | Default model in `provider/model-id` format. |
| `system` | string | none | Default system prompt applied to every request. |
| `temperature` | number | Provider default | Sampling temperature. Must be between `0` and `2`. |
| `maxOutputTokens` | integer | Provider default | Maximum tokens to generate. Must be a positive integer. |

All fields are optional. Omit any you do not want to set.

### Examples

Minimal config -- just change the default model:

```json
{
  "model": "anthropic/claude-sonnet-4-5"
}
```

Full config for a code assistant:

```json
{
  "model": "anthropic/claude-sonnet-4-5",
  "system": "You are a senior software engineer. Be concise and suggest best practices.",
  "temperature": 0.3,
  "maxOutputTokens": 4000
}
```

### Priority

CLI flags always override config values. For example:

```bash
# config.json has model: "anthropic/claude-sonnet-4-5"
# This command uses gpt-4o instead:
ai-pipe -m openai/gpt-4o "hello"
```

Resolution order:

1. CLI flags (highest priority)
2. `config.json` values
3. Built-in defaults (lowest priority)

## apiKeys.json

Store API keys in a file instead of (or in addition to) environment variables.

### Format

```json
{
  "openai": "sk-...",
  "anthropic": "sk-ant-...",
  "google": "AIza...",
  "groq": "gsk_..."
}
```

Keys must be valid provider names. The full list of valid providers:

```
openai, anthropic, google, perplexity, xai, mistral, groq, deepseek,
cohere, fireworks, openrouter, azure, togetherai, bedrock, vertex,
ollama, huggingface, deepinfra
```

### Priority

Environment variables always take precedence over `apiKeys.json`:

```bash
# Even if apiKeys.json has openai: "key-from-file"
# this env var wins:
export OPENAI_API_KEY="key-from-env"
```

### Security Note

Keep `apiKeys.json` readable only by your user:

```bash
chmod 600 ~/.ai-pipe/apiKeys.json
```

Add it to your global gitignore to prevent accidental commits:

```bash
echo "apiKeys.json" >> ~/.gitignore_global
```

## Roles

Roles are reusable system prompts stored as `.md` files in `~/.ai-pipe/roles/`.

### Creating a Role

```bash
mkdir -p ~/.ai-pipe/roles
```

Create a file with a `.md` extension:

```bash
cat > ~/.ai-pipe/roles/reviewer.md << 'EOF'
You are a senior code reviewer. Focus on:
- Bug risks and edge cases
- Performance implications
- Code clarity and maintainability
- Security concerns

Be concise. Use bullet points. Suggest specific fixes.
EOF
```

### Using a Role

```bash
ai-pipe -r reviewer -f src/index.ts
```

The role name is the filename without the `.md` extension. Both of these work:

```bash
ai-pipe -r reviewer "review this code"
ai-pipe -r reviewer.md "review this code"
```

### Listing Roles

```bash
ai-pipe --roles
```

Output:

```
Available roles:
  - reviewer
  - translator
  - writer
```

### Example Role Files

**`~/.ai-pipe/roles/concise.md`**

```markdown
Be extremely concise. Answer in as few words as possible.
Use bullet points. No preamble or closing remarks.
```

**`~/.ai-pipe/roles/teacher.md`**

```markdown
You are a patient teacher. Explain concepts step by step.
Use simple language and concrete examples.
Ask if the student has questions after each explanation.
```

**`~/.ai-pipe/roles/devops.md`**

```markdown
You are a senior DevOps engineer specializing in:
- Docker and Kubernetes
- CI/CD pipelines (GitHub Actions, GitLab CI)
- Infrastructure as Code (Terraform, Pulumi)
- Cloud platforms (AWS, GCP, Azure)

Provide production-ready configurations. Include comments.
Flag security concerns.
```

**`~/.ai-pipe/roles/sql.md`**

```markdown
You are a SQL expert. When asked a question:
1. Output only valid SQL
2. Use standard SQL syntax unless a specific database is mentioned
3. Add comments explaining complex parts
4. Optimize for readability first, then performance
```

### Role vs System Prompt

If both `--role` and `--system` are provided, `--system` takes precedence and the role is ignored:

```bash
# Uses the --system prompt, not the reviewer role
ai-pipe -r reviewer -s "Just say hello" "anything"
```

## Sessions (Conversation History)

Sessions let you maintain multi-turn conversations across separate `ai-pipe` invocations.

### How It Works

1. You start a session with `-C <name>` (or `--session <name>`)
2. Your message and the assistant's response are saved to `~/.ai-pipe/history/<name>.json`
3. On the next invocation with the same session name, the full conversation history is loaded and sent to the model
4. The model sees all previous messages and can maintain context

### Starting a Session

```bash
ai-pipe -C myproject "Let's design a REST API for a todo app"
```

### Continuing a Session

```bash
ai-pipe -C myproject "Add authentication to the design"
ai-pipe -C myproject "Now add rate limiting"
```

### Session Names

Session names can contain letters, numbers, hyphens, and underscores:

```
Valid:   chat, my-project, work_notes, session123
Invalid: my project, chat/main, ../etc
```

Invalid characters are automatically sanitized to underscores.

### Where Sessions Are Stored

```
~/.ai-pipe/history/
├── myproject.json
├── work.json
└── daily-standup.json
```

Each file is a JSON array of messages:

```json
[
  { "role": "user", "content": "Let's design a REST API for a todo app" },
  { "role": "assistant", "content": "Here's a design for a REST API..." },
  { "role": "user", "content": "Add authentication to the design" },
  { "role": "assistant", "content": "To add authentication, you could..." }
]
```

### Session with System Prompt

A system prompt is only injected on the first message of a session:

```bash
ai-pipe -C tutor -s "You are a patient math tutor" "explain fractions"
# System prompt is saved at the beginning of the history

ai-pipe -C tutor "now explain decimals"
# The system prompt persists from the first message
```

### Clearing a Session

Delete the history file to start fresh:

```bash
rm ~/.ai-pipe/history/myproject.json
```

### Listing Sessions

```bash
ls ~/.ai-pipe/history/
```

## Custom Config Directory

Use `-c` / `--config` to point to a different config directory:

```bash
ai-pipe -c ./project-config "hello"
```

This is useful for:

- **Per-project settings** -- different models and system prompts per repo
- **Team-shared configs** -- check a config directory into version control
- **Testing** -- use a separate config for experiments

### Example: Per-Project Config

```bash
mkdir -p ./ai-config

cat > ./ai-config/config.json << 'EOF'
{
  "model": "anthropic/claude-sonnet-4-5",
  "system": "You are helping develop the FooBar project, a REST API built with Go and PostgreSQL."
}
EOF

ai-pipe -c ./ai-config "explain the architecture"
```

### Example: Team Config

```bash
# .ai-pipe/config.json (checked into repo)
{
  "model": "openai/gpt-4o",
  "system": "You are assisting with the Acme Corp codebase. Follow our style guide: use functional components, prefer composition over inheritance, write tests for every feature.",
  "temperature": 0.3
}
```

```bash
# In your Makefile or scripts
ai-pipe -c ./.ai-pipe -f src/app.ts "review this code"
```

> **Note:** The `--config` flag only affects where `config.json` and `apiKeys.json` are loaded from. Roles are always loaded from `~/.ai-pipe/roles/` and session history is always stored in `~/.ai-pipe/history/`, regardless of the `--config` value.

## Full Setup Example

Here is a complete setup from scratch:

```bash
# 1. Create the config directory
mkdir -p ~/.ai-pipe/roles

# 2. Set your default model and preferences
cat > ~/.ai-pipe/config.json << 'EOF'
{
  "model": "anthropic/claude-sonnet-4-5",
  "temperature": 0.5,
  "maxOutputTokens": 4000
}
EOF

# 3. Store API keys (optional -- env vars work too)
cat > ~/.ai-pipe/apiKeys.json << 'EOF'
{
  "openai": "sk-...",
  "anthropic": "sk-ant-..."
}
EOF
chmod 600 ~/.ai-pipe/apiKeys.json

# 4. Create some useful roles
cat > ~/.ai-pipe/roles/reviewer.md << 'EOF'
You are a senior code reviewer. Be concise. Use bullet points. Flag bugs, security issues, and performance concerns.
EOF

cat > ~/.ai-pipe/roles/commit.md << 'EOF'
Write a concise git commit message for the given diff. Use the conventional commits format. First line under 72 characters. No body unless the change is complex.
EOF

# 5. Set up shell completions
echo 'eval "$(ai-pipe --completions zsh)"' >> ~/.zshrc
source ~/.zshrc

# 6. Verify everything works
ai-pipe --providers
ai-pipe --roles
ai-pipe "hello world"
```
