# OpenCode Config — Inventory

What is already configured in this distribution. Read before adding or changing anything.

## Core (`core/`)

**Config**

- `core/opencode.json` → installed as `~/.config/opencode/opencode.json`
- `core/opencode.jsonc` → installed as `~/.config/opencode/opencode.jsonc`
- `core/tui.json` → installed as `~/.config/opencode/tui.json`

Each file is installed only if it exists in `core/`.

## Install

```bash
./install.sh --core                  # Core only
./install.sh --all                   # Core + all packs
./install.sh --list                  # Show available packs
```

After install, quit and restart opencode so config/plugins reload.
