# Codex CLI Config — Operating Instructions

Rules and commands for this distribution. For the onboarding map see `INDEX.md`.

## Commands

```bash
./install.sh --core                  # Core config
./install.sh --all                   # Same as --core
./uninstall.sh                       # Remove from ~/.codex
```

Run from this folder. Installs target `~/.codex/`.

## Conventions

- Core instructions: `core/global-instructions.md` → `~/.codex/AGENTS.md`.
- Hooks config: `core/hooks.json`; hook scripts in `core/hooks/`.
- Config: `core/config.toml`, `core/auth.json`.

## Install behavior

Install updates selected repo-owned paths without pruning unrelated files from
`~/.codex/`. Update local config here, then reinstall.

## Boundaries

- Do not edit `~/.codex/` directly; edit the source here and reinstall.
