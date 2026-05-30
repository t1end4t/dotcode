# Codex CLI Config — Inventory

What is already configured in this distribution. Read before adding or changing anything.

## Core (`core/`)

**Global instructions** — `core/global-instructions.md` → installed as `~/.codex/AGENTS.md`

No hooks, no commands, no MCP, no plugins configured yet.

### Core Skills

- **skill-creator** — Create, edit, eval, and optimize skills
- **mcp-builder** — Guide for creating MCP servers (Python/Node)
- **commit** — Commit normal repos or submodules, including parent pointer commits

## Packs (`packs/`)

### data-analysis
- **get-available-resources** — ...
- **modal** — ...

- **statistical-analysis** — Guided test selection, assumption checking, APA reporting
- **exploratory-data-analysis** — Auto-detect 200+ file formats, quality reports
- **database-lookup** — Query 78 public scientific/biomedical/economic APIs
- **polars** — Fast in-memory DataFrames (Arrow backend, lazy eval)
- **dask** — Distributed computing for larger-than-RAM workflows
- **markitdown** — Convert PDF/DOCX/PPTX/images to Markdown

### deep-learning
- **get-available-resources** — ...
- **modal** — ...

- **optimize-for-gpu** — RAPIDS/CUDA acceleration (cuDF, cuML, cuPy, Numba, Warp, …)
- **pytorch-lightning** — LightningModule, Trainer, DataModule, distributed training
- **transformers** — HuggingFace Transformers usage

### office-tools

- **docx** — Word documents
- **pdf** — PDF files
- **pptx** — PowerPoint presentations
- **xlsx** — Excel spreadsheets

### research-workflow
- **exa-search** — ...
- **open-notebook** — ...

- **citation-management** — Citations
- **literature-review** — Literature review workflow
- **paper-lookup** — Find papers
- **research-lookup** — Cross-database search

### scientific-reasoning
- **hypogenic** — ...
- **scholar-evaluation** — ...

- **hypothesis-generation** — Generate hypotheses
- **scientific-brainstorming** — Brainstorm research ideas
- **scientific-critical-thinking** — Evaluate evidence quality

### scientific-visualization

- **scientific-visualization** — Publication-ready multi-panel figures (Nature/Science/Cell)
- **scientific-schematics** — AI-generated diagrams (neural nets, pathways, flowcharts)
- **matplotlib** — Low-level plotting with full customization
- **seaborn** — Statistical visualization with pandas integration
- **markdown-mermaid-writing** — 24 Mermaid diagram types + 9 document templates
- **infographics** — Professional infographics with AI refinement

### scientific-writing

- **peer-review** — Review manuscripts
- **scientific-writing** — Write/format manuscripts (LaTeX templates)
- **venue-templates** — Conference/journal/grant templates (NeurIPS, Nature, NIH, …)

## Install

```bash
./install.sh --core                  # Core only
./install.sh --pack=NAME             # Single pack
./install.sh --all                   # Core + all packs
./install.sh --list                  # Show available packs
```

---

## Mandatory Preflight For Setup Tasks

Before making any change related to Codex setup, you must read:

1. `../external/codex-cli-best-practice/AGENTS.md`
2. Relevant file(s) under `../external/codex-cli-best-practice/best-practice/`

Use this mapping:

- Subagents: `codex-subagents.md`
- Skills: `codex-skills.md`
- Hooks: `codex-hooks.md`
- MCP: `codex-mcp.md`
- Config: `codex-config.md`
- Marketplace/plugins: `codex-marketplace.md`
- Memory: `codex-memory.md`
- AGENTS.md guidance: `codex-agents-md.md`

## Trigger Conditions

Run the preflight above whenever the request touches any of:

- `.codex/`
- `.agents/`
- subagents
- skills
- hooks
- MCP
- marketplace/plugins
- memories
- commands/workflows
