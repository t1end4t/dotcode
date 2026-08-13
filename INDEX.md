# dotcode — Index

Onboarding map for the shared coding-agent config repo.

## Agents

| Folder | Target | Instruction file | Map |
| ------ | ------ | ---------------- | --- |
| `claude/` | `~/.claude/` | `CLAUDE.md` | `claude/INDEX.md` |
| `codex/` | `~/.codex/` | `AGENTS.md` | `codex/INDEX.md` |
| `opencode/` | `~/.config/opencode/` | `AGENTS.md` | `opencode/INDEX.md` |

## Read first

1. `AGENTS.md` — repo operating rules
2. `README.md` — user-facing overview
3. Agent folder `AGENTS.md` — distro-specific rules
4. Agent folder `INDEX.md` — distro-specific map/inventory

## Structure

- `install.sh` / `uninstall.sh` — top-level dispatcher
- `claude/` — Claude Code config distribution
- `codex/` — Codex CLI config distribution
- `opencode/` — OpenCode config distribution
- `external/claude-skills/` — Claude Code skill source (Claude only)

## Skills

Only `claude/` installs skills, directly from `external/claude-skills/skills/`.
Codex and OpenCode cannot load Claude Code skills, so they install none.

- `external/claude-skills`
