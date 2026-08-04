# dotcode

Shared config home for coding agents.

## Structure

```text
claude/       # Claude Code config → ~/.claude/
codex/        # Codex CLI config   → ~/.codex/
opencode/     # OpenCode config    → ~/.config/opencode/
external/     # Shared Claude skills submodule
```

## Install

Select one or more agents first, then pass installer options.

```bash
git submodule update --init external/claude-skills
./install.sh --codex --core
./install.sh --claude --core
./install.sh --opencode --core
./install.sh --all-agents --all
./install.sh --codex --list
```

Agent flags:

- `--codex` installs to `~/.codex`
- `--claude` installs to `~/.claude`
- `--opencode` installs to `~/.config/opencode`
- `--all-agents` installs every supported agent

Common installer options: `--core`, `--all`, `--list`. Claude also supports
`--mcp`.

Core installs copy every skill from `external/claude-skills/skills/` into the
selected agent's global skills directory.

Installer behavior: selected repo-owned files are installed or updated without
pruning unrelated files from the target config directories.

## Uninstall

```bash
./uninstall.sh --codex --core
./uninstall.sh --opencode --core
./uninstall.sh --all-agents --all
```
