# Claude Code Config — Operating Instructions

Rules and commands for this distribution. For the onboarding map see `INDEX.md`.

## Commands

```bash
./install.sh --core                  # Core config + shared Claude skills
./install.sh --mcp                   # MCP servers only
./install.sh --all                   # Core + MCP servers
./install.sh --list                  # Show shared Claude skills
./uninstall.sh                       # Remove from ~/.claude
```

Run from this folder (the installer targets `~/.claude/`).

## Conventions

- Core instructions: `core/global-instructions.md` → `~/.claude/CLAUDE.md`.
- Commands live in `core/commands/`, hooks in `core/hooks/`, env in `core/environment.d/`.
- MCP servers installed via `core/mcp.sh`.
- Skills come only from `../external/claude-skills/skills/`.

## Install behavior

Install updates selected repo-owned paths without pruning unrelated files from
`~/.claude/`. Update local config here or the skill submodule, then reinstall.

## Boundaries

- Do not edit `~/.claude/` directly; edit the source here and reinstall.
- Do not hand-edit `external/claude-skills`; update the submodule instead.
