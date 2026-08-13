# dotcode

Shared config home for coding agents.

## Structure

```text
claude/       # Claude Code config → ~/.claude/
codex/        # Codex CLI config   → ~/.codex/
opencode/     # OpenCode config    → ~/.config/opencode/
external/     # Claude Code skills submodule (Claude only)
```

## Install

Select one or more agents first, then pass installer options.

```bash
git submodule update --init external/claude-skills
./install.sh --codex --core
./install.sh --claude --core
./install.sh --opencode --core
./install.sh --all-agents --all
./install.sh --claude --list
```

Agent flags:

- `--codex` installs to `~/.codex`
- `--claude` installs to `~/.claude`
- `--opencode` installs to `~/.config/opencode`
- `--all-agents` installs every supported agent

Common installer options: `--core`, `--all`. Claude also supports `--list` and
`--mcp`.

The Claude install copies every skill from `external/claude-skills/skills/` into
`~/.claude/skills/`. Codex and OpenCode install no skills — the shared skills are
Claude Code skills and are not supported by those agents.

Installer behavior: selected repo-owned files are installed or updated without
pruning unrelated files from the target config directories.

## Uninstall

```bash
./uninstall.sh --codex --core
./uninstall.sh --opencode --core
./uninstall.sh --all-agents --all
```
