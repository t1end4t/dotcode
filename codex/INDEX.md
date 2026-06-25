# Codex CLI Config — Index

Onboarding map for this distribution (`codex/` → `~/.codex/`).

## Read first

1. `AGENTS.md` — operating instructions (install, preflight, boundaries)
2. `core/global-instructions.md` — agent global instructions
3. `core/config.toml` — harness config

## Structure

- `core/` — global instructions, config (`config.toml`, `auth.json`), hooks
  (`hooks.json` + `core/hooks/`), core skills (`core/skills/`)
- `packs/` — optional skill bundles
- `install.sh` / `uninstall.sh` — deploy/remove
- `MIGRATE-SKILLS-FROM-CLAUDE.md` — notes on porting skills from the Claude distro

## Core

- No hooks, commands, MCP, or plugins configured yet.
- **Core skills**: `skill-creator`, `mcp-builder`, `commit`

## Packs (`packs/`)

- **data-analysis** — statistical-analysis, exploratory-data-analysis, database-lookup, polars, dask, markitdown
- **deep-learning** — optimize-for-gpu, pytorch-lightning, transformers
- **office-tools** — docx, pdf, pptx, xlsx
- **research-workflow** — citation-management, literature-review, paper-lookup, research-lookup
- **scientific-reasoning** — hypothesis-generation, scientific-brainstorming, scientific-critical-thinking
- **scientific-visualization** — scientific-visualization, scientific-schematics, matplotlib, seaborn, markdown-mermaid-writing, infographics
- **scientific-writing** — peer-review, scientific-writing, venue-templates
