# Codex CLI Config — Index

Onboarding map for this distribution (`codex/` → `~/.codex/`).

## Read first

1. `AGENTS.md` — operating instructions (install, preflight, boundaries)
2. `core/global-instructions.md` — agent global instructions
3. `core/config.toml` — harness config

## Structure

- `core/` — global instructions, config (`config.toml`), hooks
  (`hooks.json` + `core/hooks/`), core skills (`core/skills/`)
- `packs/` — optional skill bundles
- `install.sh` / `uninstall.sh` — deploy/remove
- `MIGRATE-SKILLS-FROM-CLAUDE.md` — notes on porting skills from the Claude distro

## Core

- **Hooks**: `user-prompt-submit-notification.sh`, `stop-notification.sh`
- **Core skills**: `commit-commands`, `frontend-design`, `hpc-training`

## Packs (`packs/`)

- `data-analysis`
- `deep-learning`
- `office-tools`
- `research-workflow`
- `scientific-reasoning`
- `scientific-visualization`
- `scientific-writing`
