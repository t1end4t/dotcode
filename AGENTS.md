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
./install.sh --claude --list          # List shared skills
./uninstall.sh                        # Remove selected installs
```

## Conventions

- `AGENTS.md` contains operating instructions only.
- `INDEX.md` contains onboarding maps/inventory only.
- `CLAUDE.md` is compatibility glue and should contain only `@AGENTS.md`.
- Add local docs only for meaningful directories with distinct rules or maps.

## Install behavior

Core installs update selected repo-owned paths and copy skills from
`external/claude-skills/skills/` without pruning unrelated target files.

## Boundaries

- Do not edit generated target dirs (`~/.codex/`, `~/.claude/`,
  `~/.config/opencode/`) directly; edit this repo and reinstall.
- Do not hand-edit `external/claude-skills`; update the submodule instead.
