# Claude Code Config — Inventory

What is already configured in this distribution. Read before adding or changing anything.

## Core (`core/`)

**Global instructions** — `core/global-instructions.md` → installed as `~/.claude/CLAUDE.md`
**Harness config** — `core/settings.json`

### Core Commands

- **commit** — Commit normal repos or submodules, including parent pointer commits

### Hooks

| Hook              | File                                    | Purpose                              |
| ----------------- | --------------------------------------- | ------------------------------------ |
| UserPromptSubmit  | `hooks/user-prompt-submit-notification.sh` | Caches prompt text for Stop hook     |
| Stop              | `hooks/stop-notification.sh`            | Desktop notification when done       |

### MCP Servers

Installed via `core/mcp.sh`:
- `fetch` — `@kazuph/mcp-fetch`
- `context-mode` — `context-mode`

### Environment

- `environment.d/github.conf` — `GITHUB_PERSONAL_ACCESS_TOKEN` (template, value left blank)

### Plugins (all disabled)

- `claude-md-management`, `claude-mem`, `commit-commands`, `context7`
- `pyright-lsp`, `typescript-lsp`, `rust-analyzer-lsp`, `serena`

### Core Skills

- **mcp-builder** — Guide for creating MCP servers (Python/Node)
- **skill-creator** — Create, edit, eval, and optimize skills

## Packs (`packs/`)

### deep-learning

- **optimize-for-gpu** — RAPIDS/CUDA acceleration (cuDF, cuML, cuPy, Numba, Warp, …)
- **pytorch-lightning** — LightningModule, Trainer, DataModule, distributed training
- **transformers** — HuggingFace Transformers usage

### office-tools

- **docx** — Word documents
- **pdf** — PDF files
- **pptx** — PowerPoint presentations
- **xlsx** — Excel spreadsheets

### research-workflow

- **citation-management** — Citations
- **literature-review** — Literature review workflow
- **paper-lookup** — Find papers
- **research-lookup** — Cross-database search

### scientific-reasoning

- **hypothesis-generation** — Generate hypotheses
- **scientific-brainstorming** — Brainstorm research ideas
- **scientific-critical-thinking** — Evaluate evidence quality

### scientific-writing

- **peer-review** — Review manuscripts
- **scientific-writing** — Write/format manuscripts (LaTeX templates)
- **venue-templates** — Conference/journal/grant templates (NeurIPS, Nature, NIH, …)

### data-analysis

- **statistical-analysis** — Guided test selection, assumption checking, APA reporting
- **exploratory-data-analysis** — Auto-detect 200+ file formats, quality reports
- **database-lookup** — Query 78 public scientific/biomedical/economic APIs
- **polars** — Fast in-memory DataFrames (Arrow backend, lazy eval)
- **dask** — Distributed computing for larger-than-RAM workflows
- **markitdown** — Convert PDF/DOCX/PPTX/images to Markdown

### scientific-visualization

- **scientific-visualization** — Publication-ready multi-panel figures (Nature/Science/Cell)
- **scientific-schematics** — AI-generated diagrams (neural nets, pathways, flowcharts)
- **matplotlib** — Low-level plotting with full customization
- **seaborn** — Statistical visualization with pandas integration
- **markdown-mermaid-writing** — 24 Mermaid diagram types + 9 document templates
- **infographics** — Professional infographics with AI refinement

## Install

```bash
./install.sh --core                  # Core only
./install.sh --mcp                   # MCP servers
./install.sh --pack=deep-learning    # Single pack
./install.sh --list                  # Show available packs
```
