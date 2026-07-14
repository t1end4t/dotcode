# dotcode — Operating Instructions

Rules and commands for this repo. For the onboarding map see `INDEX.md`.

## Scope

This repo is the source of truth for shared coding-agent configs. Each top-level
agent folder installs into that agent's home config directory.

## Commands

```bash
./install.sh --claude --core          # Claude core only
./install.sh --codex --core           # Codex core only
./install.sh --opencode --core        # OpenCode core only
./install.sh --all-agents --all       # Everything
./install.sh --codex --pack=NAME --target=/path/to/project
./install.sh --claude --list          # List packs
./uninstall.sh                        # Remove selected installs
```

## Conventions

- `AGENTS.md` contains operating instructions only.
- `INDEX.md` contains onboarding maps/inventory only.
- `CLAUDE.md` is compatibility glue and should contain only `@AGENTS.md`.
- Add local docs only for meaningful directories with distinct rules or maps.

## Install behavior

Installers update selected repo-owned paths without pruning unrelated files from
the target config directories.

## Boundaries

- Do not edit generated target dirs (`~/.codex/`, `~/.claude/`,
  `~/.config/opencode/`) directly; edit this repo and reinstall.
- Always pass `--target=DIR` for pack installs. Without it, packs install into
  the current working directory.
- Do not touch `external/` unless the user explicitly asks. Treat it as reference
  input for sync/preflight only.
