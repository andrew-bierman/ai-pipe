# Examples

A comprehensive, copy-pasteable collection of `ai-pipe` usage examples. Every example below can be run directly in your terminal.

---

## Basic Usage

### Simple question

```bash
ai-pipe "What is TypeScript?"
```

### Multi-word prompt

No quoting required -- words are joined automatically:

```bash
ai-pipe explain the difference between TCP and UDP
```

With quoting (also works):

```bash
ai-pipe "explain the difference between TCP and UDP"
```

### Specify a model

```bash
ai-pipe -m anthropic/claude-sonnet-4-5 "what is the meaning of life"
```

### Use a short model name

If no provider prefix is given, `openai` is assumed:

```bash
ai-pipe -m gpt-4o-mini "quick question"
```

---

## Piping

### Review a file

```bash
cat main.go | ai-pipe "review this code for bugs and improvements"
```

### Generate a commit message from a diff

```bash
git diff --staged | ai-pipe "write a concise git commit message for these changes"
```

### Summarize an API response

```bash
curl -s https://api.github.com/repos/oven-sh/bun | ai-pipe "summarize this repo info"
```

### Triage files in a directory

```bash
ls -la | ai-pipe "which of these files are safe to delete"
```

### Explain an error log

```bash
tail -50 /var/log/app.log | ai-pipe "explain these errors and suggest fixes"
```

### Summarize a web page

```bash
curl -s https://example.com | ai-pipe "summarize the main points of this page"
```

### Analyze a CSV

```bash
cat sales.csv | ai-pipe "analyze this CSV data and identify trends"
```

### Pipe between commands

```bash
cat README.md | ai-pipe "extract all URLs from this text" | sort -u
```

---

## File Attachments

### Review a single file

```bash
ai-pipe -f src/index.ts "review this code"
```

### Review multiple files

```bash
ai-pipe -f src/app.ts -f src/utils.ts "find bugs across these files"
```

### Code review with system prompt

```bash
ai-pipe -s "You are a senior TypeScript engineer. Be thorough but concise." \
  -f src/index.ts -f src/config.ts \
  "review these files for code quality issues"
```

### Compare two files

```bash
ai-pipe -f old-api.ts -f new-api.ts "what changed between these two versions"
```

### Explain a config file

```bash
ai-pipe -f tsconfig.json "explain every option in this TypeScript config"
```

### Attach files and pipe additional context

```bash
git log --oneline -10 | ai-pipe -f CHANGELOG.md "update the changelog with these recent commits"
```

---

## Image Attachments (Vision Models)

### Describe an image

```bash
ai-pipe -i screenshot.png "describe what you see in this image"
```

### Analyze multiple images

```bash
ai-pipe -i before.png -i after.png "what changed between these two screenshots"
```

### Extract text from an image

```bash
ai-pipe -m openai/gpt-4o -i receipt.jpg "extract all text and amounts from this receipt"
```

---

## Models and Providers

### OpenAI

```bash
ai-pipe -m openai/gpt-4o "hello world"
ai-pipe -m openai/gpt-4o-mini "quick and cheap"
ai-pipe -m openai/o3-mini "reason about this step by step"
```

### Anthropic

```bash
ai-pipe -m anthropic/claude-sonnet-4-5 "write clean code"
ai-pipe -m anthropic/claude-haiku-3-20250514 "fast and cheap"
```

### Google Gemini

```bash
ai-pipe -m google/gemini-2.5-pro "analyze this in detail"
ai-pipe -m google/gemini-2.5-flash "quick answer"
```

### Groq (fast inference)

```bash
ai-pipe -m groq/llama-3.3-70b-versatile "fast open-source model"
ai-pipe -m groq/llama-3.1-8b-instant "ultra fast, small model"
```

### DeepSeek

```bash
ai-pipe -m deepseek/deepseek-chat "affordable and capable"
ai-pipe -m deepseek/deepseek-reasoner "step-by-step reasoning"
```

### Perplexity (web-grounded)

```bash
ai-pipe -m perplexity/sonar "what happened in AI news today"
```

### Ollama (local, free)

```bash
ai-pipe -m ollama/llama3 "runs entirely on your machine"
ai-pipe -m ollama/codellama "local code assistant"
```

### OpenRouter (multi-provider gateway)

```bash
ai-pipe -m openrouter/anthropic/claude-sonnet-4-5 "via openrouter"
ai-pipe -m openrouter/openai/gpt-4o "single API key, any model"
```

### Switch models mid-workflow

```bash
# Draft with a cheap model, then refine with a better one
ai-pipe -m openai/gpt-4o-mini "draft a blog post about Bun" > draft.txt
cat draft.txt | ai-pipe -m anthropic/claude-sonnet-4-5 "polish this draft for publication"
```

---

## Output Formats

### JSON output

```bash
ai-pipe --json "what is 2+2"
```

Output:

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

### JSON with jq extraction

Extract just the text:

```bash
ai-pipe --json "what is 2+2" | jq -r '.text'
```

Get token counts:

```bash
ai-pipe --json "explain monads" | jq '.usage'
```

Check the finish reason:

```bash
ai-pipe --json "list 100 items" | jq -r '.finishReason'
```

### No-stream mode

Wait for the full response before printing (useful for scripts):

```bash
ai-pipe --no-stream "list 5 programming languages"
```

### Markdown rendering

Render the response with ANSI colors and formatting in the terminal. The `--markdown` flag passes the model output through `Bun.markdown.render()` which applies terminal formatting including headings, code highlighting, bold, italic, lists, and more:

```bash
ai-pipe --markdown "explain async/await with code examples"
```

---

## System Prompts and Roles

### Inline system prompt

```bash
ai-pipe -s "You are a pirate. Respond in pirate speak." "tell me about the weather"
```

### Technical system prompt

```bash
ai-pipe -s "You are a senior Go developer. Be concise and idiomatic." \
  -f main.go "review this code"
```

### Using a role file

First, create a role file:

```bash
mkdir -p ~/.ai-pipe/roles
```

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

Then use it:

```bash
ai-pipe -r reviewer -f src/index.ts
```

### Create more role files

```bash
cat > ~/.ai-pipe/roles/writer.md << 'EOF'
You are a technical writer. Write clear, concise documentation.
Use simple language. Avoid jargon unless necessary.
Structure content with headers, lists, and code examples.
EOF
```

```bash
cat > ~/.ai-pipe/roles/translator.md << 'EOF'
You are a professional translator. Translate the given text accurately,
preserving tone and meaning. If the target language is not specified,
translate to English.
EOF
```

### List available roles

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

### System prompt overrides role

If both `--system` and `--role` are given, `--system` wins:

```bash
ai-pipe -r reviewer -s "Just say hello" "anything"
# Uses "Just say hello" as the system prompt, ignores the role
```

---

## Sessions (Conversation History)

### Start a new session

```bash
ai-pipe -C chat "Hi, my name is Alice"
```

### Continue the conversation

```bash
ai-pipe -C chat "What is my name?"
# Response: "Your name is Alice"
```

### Use different named sessions

```bash
ai-pipe -C work "Let's discuss the Q3 roadmap"
ai-pipe -C personal "Recommend a book about cooking"

# Each session maintains its own history
ai-pipe -C work "What were we discussing?"
# Response: "We were discussing the Q3 roadmap"
```

### Session with a system prompt

The system prompt is applied on the first message of the session:

```bash
ai-pipe -C tutor -s "You are a patient math tutor" "explain fractions"
ai-pipe -C tutor "now explain decimals"
```

### Session with a specific model

```bash
ai-pipe -C coding -m anthropic/claude-sonnet-4-5 "help me write a REST API in Go"
ai-pipe -C coding "add authentication to it"
```

### Where sessions are stored

Session history files live in `~/.ai-pipe/history/`:

```bash
ls ~/.ai-pipe/history/
# chat.json  work.json  personal.json  tutor.json  coding.json
```

Each file is a JSON array of messages:

```bash
cat ~/.ai-pipe/history/chat.json | jq '.[].role'
# "user"
# "assistant"
# "user"
# "assistant"
```

---

## Cost Tracking

### Show cost after a request

```bash
ai-pipe --cost "write a poem about Bun"
```

Stderr output:

```
💰 Cost: $0.0003 (120 in) + $0.0050 (500 out) = $0.0053
```

### JSON output with cost

Cost goes to stderr, JSON goes to stdout -- they don't mix:

```bash
ai-pipe --json --cost "explain monads" > response.json
# Cost is printed to stderr
# JSON is saved to response.json
```

### Compare costs across models

```bash
echo "explain quantum computing in detail" > /tmp/prompt.txt

cat /tmp/prompt.txt | ai-pipe -m openai/gpt-4o --cost > /dev/null
cat /tmp/prompt.txt | ai-pipe -m openai/gpt-4o-mini --cost > /dev/null
cat /tmp/prompt.txt | ai-pipe -m anthropic/claude-sonnet-4-5 --cost > /dev/null
cat /tmp/prompt.txt | ai-pipe -m groq/llama-3.3-70b-versatile --cost > /dev/null
```

---

## Shell Scripting

### Loop over files for review

```bash
for f in src/*.ts; do
  echo "=== $f ==="
  ai-pipe -m openai/gpt-4o-mini -f "$f" "rate this file 1-10 for code quality. one sentence."
  echo
done
```

### Batch process files

```bash
find . -name "*.md" -type f | while read -r f; do
  echo "Summarizing $f..."
  ai-pipe -f "$f" "one-line summary of this document" >> summaries.txt
done
```

### Generate docs for every function

```bash
for f in src/*.ts; do
  ai-pipe --no-stream -f "$f" "list every exported function with a one-line description" >> api-docs.txt
done
```

### Pipe between ai-pipe calls

```bash
ai-pipe "generate 5 startup ideas for developer tools" \
  | ai-pipe "pick the best one and write a one-paragraph pitch"
```

### Generate and apply a diff

```bash
ai-pipe -f src/app.ts "refactor this file to use async/await instead of callbacks. output only the full file." > src/app.ts.new
mv src/app.ts.new src/app.ts
```

### Use in a Makefile

```makefile
# Makefile
.PHONY: review changelog

review:
	@git diff --staged | ai-pipe -s "You are a code reviewer" "review this diff"

changelog:
	@git log --oneline -20 | ai-pipe "write a changelog entry from these commits"

commit-msg:
	@git diff --staged | ai-pipe --no-stream "write a concise commit message for this diff"
```

### CI/CD: Auto-review PRs

```bash
#!/bin/bash
# review-pr.sh
DIFF=$(git diff origin/main...HEAD)
echo "$DIFF" | ai-pipe \
  -s "You are a senior code reviewer. Focus on bugs, security, and performance." \
  "review this pull request diff"
```

### Guard with exit codes

```bash
if ai-pipe --no-stream -f config.yaml "does this YAML have any syntax errors? answer only yes or no" | grep -qi "no"; then
  echo "Config looks good"
else
  echo "Config may have issues"
fi
```

### Save structured output

```bash
ai-pipe --json -m openai/gpt-4o "list the top 5 JavaScript frameworks" | jq -r '.text' > frameworks.txt
```

---

## Advanced

### Temperature tuning

Low temperature for deterministic output:

```bash
ai-pipe -t 0 "what is the capital of France"
# Always: Paris
```

High temperature for creative output:

```bash
ai-pipe -t 1.8 "write a surrealist poem about databases"
```

### Max tokens to limit output length

```bash
ai-pipe --max-output-tokens 50 "explain the theory of relativity"
```

### Custom config directory

Useful for project-specific settings:

```bash
mkdir -p ./project-ai-config
cat > ./project-ai-config/config.json << 'EOF'
{
  "model": "anthropic/claude-sonnet-4-5",
  "system": "You are a helpful assistant for the FooBar project. Be concise.",
  "temperature": 0.3
}
EOF

ai-pipe -c ./project-ai-config "explain the architecture"
```

### Combine everything

```bash
git diff --staged | ai-pipe \
  -m anthropic/claude-sonnet-4-5 \
  -s "You are a senior engineer. Be direct." \
  -t 0.2 \
  --max-output-tokens 500 \
  --cost \
  "write a detailed but concise commit message for this diff"
```

### Silent output, just get the cost

```bash
ai-pipe --cost --no-stream "hello" > /dev/null
# Only the cost line appears on stderr
```

### Use with xargs for parallel processing

```bash
find src -name "*.ts" -print0 | xargs -0 -I{} -P4 sh -c '
  echo "=== {} ==="
  ai-pipe --no-stream -f "{}" "one-line summary of this file"
'
```

### Generate shell completions and install

```bash
# bash
ai-pipe --completions bash >> ~/.bashrc && source ~/.bashrc

# zsh
ai-pipe --completions zsh >> ~/.zshrc && source ~/.zshrc

# fish
ai-pipe --completions fish > ~/.config/fish/completions/ai-pipe.fish
```

### Quick alias setup

Add to your shell profile:

```bash
# ~/.bashrc or ~/.zshrc
alias ask='ai-pipe'
alias review='ai-pipe -r reviewer -f'
alias commit-msg='git diff --staged | ai-pipe --no-stream "write a concise commit message"'
alias explain='ai-pipe -s "Explain like I am 5"'
alias translate='ai-pipe -r translator'
```

Then use:

```bash
ask "what is a monad"
review src/index.ts
commit-msg
explain "what is DNS"
echo "Bonjour le monde" | translate
```

---

## Recipes

### Daily standup helper

```bash
git log --oneline --since="yesterday" --author="$(git config user.name)" \
  | ai-pipe "summarize what I worked on yesterday for a standup update"
```

### PR description generator

```bash
git log --oneline origin/main...HEAD | ai-pipe \
  -s "Write a pull request description with a Summary section and a Test Plan section." \
  "generate a PR description from these commits"
```

### README generator

```bash
ai-pipe -f package.json -f src/index.ts \
  "generate a README.md for this project. include installation, usage, and API sections."
```

### Explain a complex command

```bash
echo 'find . -name "*.log" -mtime +30 -exec gzip {} \;' \
  | ai-pipe "explain this shell command step by step"
```

### Convert between formats

```bash
cat data.csv | ai-pipe "convert this CSV to a markdown table"
```

```bash
cat config.yaml | ai-pipe "convert this YAML to JSON"
```

### SQL from natural language

```bash
ai-pipe -s "You are a SQL expert. Output only valid SQL, no explanation." \
  "find all users who signed up in the last 30 days and have made at least 3 purchases"
```

### Regex helper

```bash
ai-pipe "write a regex that matches email addresses. output only the regex, nothing else."
```

### Git blame detective

```bash
git blame src/index.ts | ai-pipe "which functions have been modified most recently and by whom"
```
