# OpenCode Config — Index

Onboarding map for this distribution (`opencode/` → `~/.config/opencode/`).

## Read first

1. `AGENTS.md` — operating instructions (install, conventions, boundaries)
2. `core/opencode.json` — main config
3. `core/oh-my-opencode-slim.json` — plugin preset and agent models
4. `core/global-instructions.md` — global coding-agent instructions
5. `core/tui.json` — TUI config

## Structure

- `core/` — global instructions, OpenCode configuration, and TUI configuration
- `../codex/core/skills/` — shared core Agent Skills source
- `../codex/packs/` — shared optional pack source
- `install.sh` / `uninstall.sh` — deploy/remove

## Core

- **Agent**: `explorer`
- **Plugin**: `oh-my-opencode-slim`
- **Core skills**: `commit-commands`, `frontend-design`, `hpc-training`

## Packs

- `data-analysis`
- `deep-learning`
- `office-tools`
- `research-workflow`
- `scientific-reasoning`
- `scientific-visualization`
- `scientific-writing`
