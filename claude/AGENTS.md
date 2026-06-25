# Claude Code Config — Operating Instructions

Rules and commands for this distribution. For the onboarding map see `INDEX.md`.

## Commands

```bash
./install.sh --core                  # Core only (CLAUDE.md, settings, hooks, MCP, skills)
./install.sh --mcp                   # MCP servers only
./install.sh --pack=NAME             # Single pack
./install.sh --all                   # Core + all packs
./install.sh --list                  # Show available packs
./uninstall.sh                       # Remove from ~/.claude
```

Run from this folder (the installer targets `~/.claude/`).

## Conventions

- Core instructions: `core/global-instructions.md` → `~/.claude/CLAUDE.md`.
- Commands live in `core/commands/`, hooks in `core/hooks/`, env in `core/environment.d/`.
- MCP servers installed via `core/mcp.sh`.
- Packs are under `packs/<pack>/skills/...`; one pack may bundle many skills.

## Sync behavior

Install syncs the selected config: anything removed from this folder is also
removed from `~/.claude/`. Add skills/hooks/prompts here first, then reinstall.

## Boundaries

- Do not edit `~/.claude/` directly; edit the source here and reinstall.
- Skill packs under `packs/` originate from `external/` repos — re-sync via
  `sync-scientific-skills.sh`, do not hand-edit synced skill files.
