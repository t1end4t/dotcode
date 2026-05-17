# OpenCode Config — Inventory

What is already configured in this distribution. Read before adding or changing anything.

## Core (`core/`)

**Config** — `core/opencode.json` → installed as `~/.config/opencode/opencode.json`

### Plugins

| Plugin | File | Purpose |
| ------ | ---- | ------- |
| notification | `plugins/notification.ts` | Claude Code-like desktop notification hooks |

## Install

```bash
./install.sh --core                  # Core only
./install.sh --all                   # Core + all packs
./install.sh --list                  # Show available packs
```

After install, quit and restart opencode so config/plugins reload.
