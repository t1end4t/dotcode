# OpenCode Config — Operating Instructions

Rules and commands for this distribution. For the onboarding map see `INDEX.md`.

## Commands

```bash
./install.sh --core                  # Core config
./install.sh --all                   # Same as --core
./uninstall.sh --core                # Remove core config
```

Run from this folder (the installer targets `~/.config/opencode/`).

After install, quit and restart opencode so config/plugins reload.

9router combo names must remain bare model ids (`combo-codex`), with OpenCode
reasoning levels configured through `variant`. Parenthesized ids such as
`combo-codex(high)` are sent literally and 9router misroutes them to `openai`.

## Conventions

- `core/opencode.json` → `~/.config/opencode/opencode.json`
- `core/opencode.jsonc` → `~/.config/opencode/opencode.jsonc`
- `core/oh-my-opencode-slim.json` → `~/.config/opencode/oh-my-opencode-slim.json`
- `core/tui.json` → `~/.config/opencode/tui.json`
- `core/global-instructions.md` → `~/.config/opencode/AGENTS.md`

## Install behavior

Install updates selected repo-owned paths without pruning unrelated files from
`~/.config/opencode/`. Edit here first, then reinstall.

## Boundaries

- Do not edit `~/.config/opencode/` directly; edit the source here and reinstall.
