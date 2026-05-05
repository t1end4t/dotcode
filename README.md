# dotcode

Shared config home for coding agents.

## Structure

```text
claude/       # Claude Code config → ~/.claude/
codex/        # Codex CLI config   → ~/.codex/
../external/  # Reference repos (submodules, outside this repo)
```

Future agents can be added beside these folders, e.g. `opencode/` or `pi/`.

## Install

Select one or more agents first, then pass installer options.

```bash
./install.sh --codex --core
./install.sh --claude --core
./install.sh --codex --claude --pack=research-workflow
./install.sh --all-agents --all
./install.sh --codex --list
```

Agent flags:

- `--codex` installs to `~/.codex`
- `--claude` installs to `~/.claude`
- `--all-agents` installs every supported agent

Installer options are passed to each selected agent installer: `--core`, `--mcp`, `--pack=NAME`, `--all`, `--list`.

## Uninstall

```bash
./uninstall.sh --codex --core
./uninstall.sh --all-agents --all
```
