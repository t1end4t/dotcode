# OpenCode Config — Operating Instructions

Rules and commands for this distribution. For the onboarding map see `INDEX.md`.

## Commands

```bash
./install.sh --core                  # Core config only
./install.sh --all                   # Core + all packs
./install.sh --list                  # Show available packs
```

Run from this folder (the installer targets `~/.config/opencode/`).

After install, quit and restart opencode so config/plugins reload.

## Conventions

- `core/opencode.json` → `~/.config/opencode/opencode.json`
- `core/opencode.jsonc` → `~/.config/opencode/opencode.jsonc`
- `core/tui.json` → `~/.config/opencode/tui.json`
- Each file is installed only if it exists in `core/`.

## Sync behavior

Install syncs the selected config: anything removed here is removed from
`~/.config/opencode/`. Edit here first, then reinstall.

## Boundaries

- Do not edit `~/.config/opencode/` directly; edit the source here and reinstall.
