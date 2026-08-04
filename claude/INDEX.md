# Claude Code Config — Index

Onboarding map for this distribution (`claude/` → `~/.claude/`).

## Read first

1. `AGENTS.md` — operating instructions (install, boundaries)
2. `core/global-instructions.md` — agent global instructions
3. `core/settings.json` — harness config

## Structure

- `core/` — global instructions, settings, commands, hooks, env, MCP
- `../external/claude-skills/skills/` — shared skill source
- `install.sh` / `uninstall.sh` — deploy/remove

## Core

- **Commands**: `commit`
- **Hooks**: `user-prompt-submit-notification.sh`, `stop-notification.sh`
- **MCP** (`core/mcp.sh`): `fetch`, `context-mode`
- **Env**: `environment.d/github.conf` (`GITHUB_PERSONAL_ACCESS_TOKEN`, blank)
- **Skills**: every directory under `../external/claude-skills/skills/`
