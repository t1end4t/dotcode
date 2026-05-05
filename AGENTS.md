# dotcode — Inventory

Shared config home for coding agents. Each subfolder is one agent's config distribution.

## Agents

| Folder   | Target       | Instruction file       |
| -------- | ------------ | ---------------------- |
| `claude/`| `~/.claude/` | `CLAUDE.md`            |
| `codex/` | `~/.codex/`  | `AGENTS.md`            |
| `pi/`    | `~/.pi/agent/` | `AGENTS.md`          |

See each folder's own `AGENTS.md` for the full inventory (hooks, MCP, skills, packs, install).

Installer behavior: selected config is synced, so removed repo skills/hooks/prompts/themes/extensions are removed from the target config folder too.

## External (sibling folder)

Reference repos live outside this repo at `../external/`:
- `claude-code-best-practice`
- `codex-cli-best-practice`
- `claude-skills`
- `scientific-agent-skills`

## Install

```bash
./install.sh --claude --core          # Claude core only
./install.sh --codex --core           # Codex core only
./install.sh --pi --core              # Pi core only
./install.sh --all-agents --all       # Everything
./install.sh --claude --pack=NAME     # Single pack
./install.sh --claude --list          # List packs
```
