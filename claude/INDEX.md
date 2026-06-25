# Claude Code Config — Index

Onboarding map for this distribution (`claude/` → `~/.claude/`).

## Read first

1. `AGENTS.md` — operating instructions (install, sync, boundaries)
2. `core/global-instructions.md` — agent global instructions
3. `core/settings.json` — harness config

## Structure

- `core/` — global instructions, settings, commands, hooks, env, MCP, core skills
- `packs/` — optional skill bundles (see below)
- `install.sh` / `uninstall.sh` — deploy/remove
- `pack-mapping.toml` — pack → skill mapping
- `sync-scientific-skills.sh` — pulls scientific skill packs from `external/`

## Core

- **Commands**: `commit`
- **Hooks**: `user-prompt-submit-notification.sh`, `stop-notification.sh`
- **MCP** (`core/mcp.sh`): `fetch`, `context-mode`
- **Env**: `environment.d/github.conf` (`GITHUB_PERSONAL_ACCESS_TOKEN`, blank)
- **Plugins** (disabled): `claude-md-management`, `claude-mem`, `commit-commands`, `context7`, `pyright-lsp`, `typescript-lsp`, `rust-analyzer-lsp`, `serena`
- **Core skills**: `mcp-builder`, `skill-creator`

## Packs (`packs/`)

- **data-analysis** — statistical-analysis, exploratory-data-analysis, database-lookup, polars, dask, markitdown
- **deep-learning** — optimize-for-gpu, pytorch-lightning, transformers
- **office-tools** — docx, pdf, pptx, xlsx
- **research-workflow** — citation-management, literature-review, paper-lookup, research-lookup
- **scientific-reasoning** — hypothesis-generation, scientific-brainstorming, scientific-critical-thinking
- **scientific-visualization** — scientific-visualization, scientific-schematics, matplotlib, seaborn, markdown-mermaid-writing, infographics
- **scientific-writing** — peer-review, scientific-writing, venue-templates
