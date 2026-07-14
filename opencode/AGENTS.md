# OpenCode Config — Operating Instructions

Rules and commands for this distribution. For the onboarding map see `INDEX.md`.

## Commands

```bash
./install.sh --core                  # Core config only
./install.sh --pack=NAME --target=DIR # Shared pack into DIR/.agents/skills
./install.sh --all                   # Core + all packs
./install.sh --list                  # Show available packs
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
- Core skills and packs reuse the Codex-compatible sources under `../codex/`.
- Pack skills use `PACK-SKILL` names required by OpenCode's skill schema.

## Install behavior

Install updates selected repo-owned paths without pruning unrelated files from
`~/.config/opencode/`. Edit here first, then reinstall.

## Boundaries

- Do not edit `~/.config/opencode/` directly; edit the source here and reinstall.
