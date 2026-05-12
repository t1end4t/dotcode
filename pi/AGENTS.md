# Pi Coding Agent Config — Inventory

What is already configured in this distribution. Read before adding or changing anything.

## Core (`core/`)

**Global instructions** — `core/global-instructions.md` → installed as `~/.pi/agent/AGENTS.md`
**Harness settings** — `core/settings.json` → installed as `~/.pi/agent/settings.json`
**Local model config** — `core/models.json` → installed as `~/.pi/agent/models.json`

No hooks, MCP, or plugins configured yet.

**Skills** — installed into `~/.pi/agent/skills/` via core install or pack installs.

### Available Skills

| Skill | Description | Command |
|-------|-------------|---------|
| `commit` | Safely create Git commits (normal + submodule), never pushes | `/skill:commit` |

## Local LLM

Configured provider:

- **llama-cpp** — OpenAI-compatible local endpoint at `http://localhost:8080/v1`

Configured model:

- **local-model** — generic alias for whatever model you load in llama-server

Expected local runtime:

```bash
llama-server \
  --model /path/to/Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf \
  --port 8080 \
  --alias local-model \
  -c 65536 \
  -n 32768 \
  -fa on \
  -ctk q8_0 -ctv q8_0 \
  --chat-template-kwargs '{"preserve_thinking": true}'
```

## Install

```bash
./install.sh --core                  # Core only
./install.sh --list                  # Show available packs
./install.sh --pack=NAME             # Install a pack
./install.sh --all                   # Core + all packs
```
