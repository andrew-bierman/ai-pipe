# ai-pipe Roadmap

## Completed ✅
- Image input (#29)
- Roles (#33)
- Conversation history (#34)
- Cost tracking (#50)
- Package.json checks script

## In Progress 🔧

## Backlog 📋
- Response caching
- Tool use / MCP support
- Provider-specific defaults
- Better error messages
- Shell completions for ai-pipe itself

## Subagent Pattern
To start work on a roadmap item:
```bash
# Create a worktree
git worktree add ../worktrees/feat/<feature-name> main

# Create branch and push
git checkout -b feat/<feature-name>
git push -u origin feat/<feature-name>

# Spawn subagent with task
openclaw sessions_spawn --task "Work on <feature>..." --label <feature>
```

## Running the Roadmap
```bash
# Check current state
cat ROADMAP.md

# Run all checks
bun scripts/checks.ts
```
