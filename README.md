# dotcode

Shared config home for coding agents.

## Structure

```text
claude/       # Claude Code config → ~/.claude/
codex/        # Codex CLI config   → ~/.codex/
pi/           # Pi Coding Agent    → ~/.pi/agent/
opencode/     # OpenCode config    → ~/.config/opencode/
../external/  # Reference repos (submodules, outside this repo)
```

## Install

Select one or more agents first, then pass installer options.

```bash
./install.sh --codex --core
./install.sh --claude --core
./install.sh --pi --core
./install.sh --opencode --core
./install.sh --codex --pack=research-workflow --target=/path/to/project
./install.sh --codex --claude --pack=research-workflow
./install.sh --all-agents --all
./install.sh --codex --list
```

Agent flags:

- `--codex` installs to `~/.codex`
- `--claude` installs to `~/.claude`
- `--pi` installs to `~/.pi/agent`
- `--opencode` installs to `~/.config/opencode`
- `--all-agents` installs every supported agent

Installer options are passed to each selected agent installer: `--core`, `--mcp`, `--pack=NAME`, `--target=DIR`, `--all`, `--list`.

Codex packs install repo-local skills into `DIR/.agents/skills` (`$PWD/.agents/skills` by default) to avoid loading large packs globally.

Installer behavior: selected config is synced, so removed repo skills/hooks/prompts/themes/extensions are removed from the target config folder too.

## Uninstall

```bash
./uninstall.sh --codex --core
./uninstall.sh --all-agents --all
```
