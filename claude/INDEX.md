# Claude Code Config — Index

Onboarding map for this distribution (`claude/` → `~/.claude/`).

## Read first

1. `AGENTS.md` — operating instructions (install, sync, boundaries)
2. `core/global-instructions.md` — agent global instructions
3. `core/settings.json` — harness config

## Structure

- `core/` — global instructions, settings, commands, hooks, env, MCP, core skills
- `packs/` — optional skill bundles (see below)
- `install.sh` / `uninstall.sh` — deploy/remove
- `pack-mapping.toml` — pack → skill mapping
- `sync-scientific-skills.sh` — pulls scientific skill packs from `external/`

## Core

- **Commands**: `commit`
- **Hooks**: `user-prompt-submit-notification.sh`, `stop-notification.sh`
- **MCP** (`core/mcp.sh`): `fetch`, `context-mode`
- **Env**: `environment.d/github.conf` (`GITHUB_PERSONAL_ACCESS_TOKEN`, blank)
- **Core skills**: `commit-commands`, `frontend-design`, `hpc-training`, `skillspector`

## Packs (`packs/`)

- `data-analysis`
- `deep-learning`
- `office-tools`
- `research-workflow`
- `scientific-reasoning`
- `scientific-visualization`
- `scientific-writing`
