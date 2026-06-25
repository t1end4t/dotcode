# Pi Coding Agent Config — Operating Instructions

Rules and commands for this distribution. For the onboarding map see `INDEX.md`.

## Commands

```bash
./install.sh --core                  # Core only (AGENTS.md, settings, models, skills)
./install.sh --pack=NAME             # Single pack
./install.sh --all                   # Core + all packs
./install.sh --list                  # Show available packs
./uninstall.sh                       # Remove from ~/.pi/agent
```

Run from this folder (the installer targets `~/.pi/agent/`).

## Conventions

- Core instructions: `core/global-instructions.md` → `~/.pi/agent/AGENTS.md`.
- Settings: `core/settings.json` → `~/.pi/agent/settings.json`.
- Models: `core/models.json` → `~/.pi/agent/models.json`.
- Skills: `core/skills/` and pack skills → `~/.pi/agent/skills/`.
- No hooks, MCP, or plugins configured yet.

## Local LLM runtime

Provider `llama-cpp` (OpenAI-compatible endpoint `http://localhost:8080/v1`),
model alias `local-model`:

```bash
llama-server \
  --model /path/to/Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf \
  --port 8080 --alias local-model \
  -c 65536 -n 32768 -fa on -ctk q8_0 -ctv q8_0 \
  --chat-template-kwargs '{"preserve_thinking": true}'
```

## Sync behavior

Install syncs the selected config: anything removed here is removed from
`~/.pi/agent/`. Add skills first here, then reinstall.

## Boundaries

- Do not edit `~/.pi/agent/` directly; edit the source here and reinstall.
