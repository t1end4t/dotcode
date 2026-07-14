# Codex CLI Config — Operating Instructions

Rules and commands for this distribution. For the onboarding map see `INDEX.md`.

## Commands

```bash
./install.sh --core                  # Core only (AGENTS.md, config, hooks, skills)
./install.sh --pack=NAME             # Single pack
./install.sh --pack=NAME --target=DIR # Pack into DIR/.agents/skills
./install.sh --all                   # Core + all packs
./install.sh --list                  # Show available packs
./uninstall.sh                       # Remove from ~/.codex
```

Run from this folder. Core targets `~/.codex/`; packs target `DIR/.agents/skills` (`$PWD` by default).

## Conventions

- Core instructions: `core/global-instructions.md` → `~/.codex/AGENTS.md`.
- Hooks config: `core/hooks.json`; hook scripts in `core/hooks/`.
- Core skills live in `core/skills/`; pack skills under `packs/<pack>/skills/` and install to repo-local `.agents/skills/`.
- Config: `core/config.toml`, `core/auth.json`.

## Install behavior

Install updates selected repo-owned paths without pruning unrelated files from
`~/.codex/`. Add skills and hooks here first, then reinstall.

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
