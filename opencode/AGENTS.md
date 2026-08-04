# OpenCode Config — Operating Instructions

Rules and commands for this distribution. For the onboarding map see `INDEX.md`.

## Commands

```bash
./install.sh --core                  # Core config + shared Claude skills
./install.sh --all                   # Same as --core
./install.sh --list                  # Show shared Claude skills
./uninstall.sh --core                # Remove core config
```

Run from this folder (the installer targets `~/.config/opencode/`).

After install, quit and restart opencode so config/plugins reload.

## Conventions

- `core/opencode.json` → `~/.config/opencode/opencode.json`
- `core/opencode.jsonc` → `~/.config/opencode/opencode.jsonc`
- `core/oh-my-opencode-slim.json` → `~/.config/opencode/oh-my-opencode-slim.json`
- `core/tui.json` → `~/.config/opencode/tui.json`
- `core/global-instructions.md` → `~/.config/opencode/AGENTS.md`
- Skills come only from `../external/claude-skills/skills/`.

## Install behavior

Install updates selected repo-owned paths without pruning unrelated files from
`~/.config/opencode/`. Edit here first, then reinstall.

## Boundaries

- Do not edit `~/.config/opencode/` directly; edit the source here and reinstall.
- Do not hand-edit `external/claude-skills`; update the submodule instead.
