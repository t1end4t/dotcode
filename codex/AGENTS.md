# Codex CLI Config — Operating Instructions

Rules and commands for this distribution. For the onboarding map see `INDEX.md`.

## Commands

```bash
./install.sh --core                  # Core only (AGENTS.md, config, hooks, skills)
./install.sh --pack=NAME             # Single pack
./install.sh --all                   # Core + all packs
./install.sh --list                  # Show available packs
./uninstall.sh                       # Remove from ~/.codex
```

Run from this folder (the installer targets `~/.codex/`).

## Conventions

- Core instructions: `core/global-instructions.md` → `~/.codex/AGENTS.md`.
- Hooks config: `core/hooks.json`; hook scripts in `core/hooks/`.
- Core skills live in `core/skills/`; pack skills under `packs/<pack>/skills/`.
- Config: `core/config.toml`, `core/auth.json`.

## Sync behavior

Install syncs the selected config: anything removed from this folder is also
removed from `~/.codex/`. Add skills/hooks here first, then reinstall.

## Mandatory preflight for setup tasks

Before any change touching Codex setup (`.codex/`, `.agents/`, subagents,
skills, hooks, MCP, marketplace/plugins, memories, commands/workflows), read:

1. `../external/codex-cli-best-practice/AGENTS.md`
2. The matching file under `../external/codex-cli-best-practice/best-practice/`:

   | Topic | File |
   | ----- | ---- |
   | Subagents | `codex-subagents.md` |
   | Skills | `codex-skills.md` |
   | Hooks | `codex-hooks.md` |
   | MCP | `codex-mcp.md` |
   | Config | `codex-config.md` |
   | Marketplace/plugins | `codex-marketplace.md` |
   | Memory | `codex-memory.md` |
   | AGENTS.md guidance | `codex-agents-md.md` |

## Boundaries

- Do not edit `~/.codex/` directly; edit the source here and reinstall.
- Skill packs under `packs/` originate from `external/` repos — re-sync, do not
  hand-edit synced skill files.
