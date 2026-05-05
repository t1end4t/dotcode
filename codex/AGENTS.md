# Codex CLI Config — Inventory

What is already configured in this distribution. Read before adding or changing anything.

## Core (`core/`)

**Global instructions** — `core/global-instructions.md` → installed as `~/.codex/AGENTS.md`

No hooks, no MCP, no skills, no plugins configured yet.

## Packs (`packs/`)

Empty — no packs created yet.

## Install

```bash
./install.sh --core                  # Core only
./install.sh --list                  # Show available packs
```

---

## Mandatory Preflight For Setup Tasks

Before making any change related to Codex setup, you must read:

1. `../external/codex-cli-best-practice/AGENTS.md`
2. Relevant file(s) under `../external/codex-cli-best-practice/best-practice/`

Use this mapping:

- Subagents: `codex-subagents.md`
- Skills: `codex-skills.md`
- Hooks: `codex-hooks.md`
- MCP: `codex-mcp.md`
- Config: `codex-config.md`
- Marketplace/plugins: `codex-marketplace.md`
- Memory: `codex-memory.md`
- AGENTS.md guidance: `codex-agents-md.md`

## Trigger Conditions

Run the preflight above whenever the request touches any of:

- `.codex/`
- `.agents/`
- subagents
- skills
- hooks
- MCP
- marketplace/plugins
- memories
- commands/workflows
