# Pi Coding Agent Config — Index

Onboarding map for this distribution (`pi/` → `~/.pi/agent/`).

## Read first

1. `AGENTS.md` — operating instructions (install, local LLM, boundaries)
2. `core/global-instructions.md` — agent global instructions
3. `core/settings.json` — harness settings
4. `core/models.json` — model/provider config

## Structure

- `core/` — global instructions, settings, models, core skills
- `core/skills/commit/` — commit skill
- `install.sh` / `uninstall.sh` — deploy/remove

## Core

- **Skills**: `commit` (safe git commits, never pushes; `/skill:commit`)
- No hooks, MCP, or plugins configured yet.

## Local LLM

- Provider: `llama-cpp` at `http://localhost:8080/v1`
- Model alias: `local-model`
