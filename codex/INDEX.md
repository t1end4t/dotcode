# Codex CLI Config — Index

Onboarding map for this distribution (`codex/` → `~/.codex/`).

## Read first

1. `AGENTS.md` — operating instructions (install, boundaries)
2. `core/global-instructions.md` — agent global instructions
3. `core/config.toml` — harness config

## Structure

- `core/` — global instructions, config (`config.toml`, `auth.json`), hooks
  (`hooks.json` + `core/hooks/`)
- `install.sh` / `uninstall.sh` — deploy/remove

## Core

- **Hooks**: `user-prompt-submit-notification.sh`, `stop-notification.sh`
