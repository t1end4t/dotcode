# Codex CLI Config — Operating Instructions

Rules and commands for this distribution. For the onboarding map see `INDEX.md`.

## Commands

```bash
./install.sh --core                  # Core config
./install.sh --all                   # Same as --core
./uninstall.sh                       # Remove from ~/.codex
./9router-aliases.sh                 # Re-point gpt-5.6-* at the codex provider
```

Run from this folder. Installs target `~/.codex/`.

## Conventions

- Core instructions: `core/global-instructions.md` → `~/.codex/AGENTS.md`.
- Hooks config: `core/hooks.json`; hook scripts in `core/hooks/`.
- Config: `core/config.toml`, `core/auth.json`.

## Install behavior

Install updates selected repo-owned paths without pruning unrelated files from
`~/.codex/`. Update local config here, then reinstall.

## 9router model aliases

Codex's model picker sends bare ids (`gpt-5.6-sol`), which 9router routes to the
`openai` provider — failing with `No active credentials for provider: openai`.
`9router-aliases.sh` maps each id to `codex/<id>`.

Aliases persist in `~/.9router/db/data.sqlite` (kv scope `modelAliases`), not in
this repo. Rerun the script after wiping that database, or when Codex ships a
new `gpt-5.6-*` model — add the id to `MODELS` first.

## Boundaries

- Do not edit `~/.codex/` directly; edit the source here and reinstall.
- Do not edit `~/.9router/`; use `9router-aliases.sh`.
