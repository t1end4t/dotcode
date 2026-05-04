# Skill Format Comparison: Claude Code vs Codex vs Agent Skills Standard

> Comparison of the three skill sources in `external/`.

---

## TL;DR

All three use the same **Agent Skills standard** (`SKILL.md` + YAML frontmatter).
The core format is identical — differences are in metadata fields, folder conventions,
and ecosystem integration.

**A skill written for one works in the others** as long as you stick to the common
subset: `name` + `description` frontmatter + markdown instructions.

---

## Format Comparison

| Aspect | Claude Code (`claude-skills`) | Codex (`codex-skills`) | Scientific (`scientific-agent-skills`) |
|---|---|---|---|
| **Standard** | Agent Skills (agentskills.io) | Agent Skills (agentskills.io) | Agent Skills (agentskills.io) |
| **Entry file** | `SKILL.md` | `SKILL.md` | `SKILL.md` |
| **Required frontmatter** | `name`, `description` | `name`, `description` | `name`, `description` |
| **Extra frontmatter** | None typically | None typically | `allowed-tools`, `license`, `metadata.skill-author` |
| **Folder structure** | `skills/<name>/SKILL.md` | `skills/.curated/<name>/SKILL.md` | `scientific-skills/<name>/SKILL.md` |
| **Optional dirs** | — | `agents/`, `assets/`, `references/`, `scripts/` | `assets/`, `references/`, `scripts/` |
| **`agents/openai.yaml`** | Not used | Used for UI metadata + invocation policy | Not used |
| **Install method** | `/plugin marketplace add anthropics/skills` | `$skill-installer <name>` | Manual copy or marketplace |
| **Discovery** | `/skills`, `$skill-name`, description match | `/skills`, `$skill-name`, description match | Same (follows standard) |

---

## Frontmatter Examples

### Minimal (works everywhere)

```yaml
---
name: my-skill
description: When to trigger this skill and what it does.
---
```

### Claude Code style

```yaml
---
name: doc-coauthoring
description: Guide users through a structured workflow for co-authoring documentation...
---
```

No extra fields. Just `name` + `description` + markdown body.

### Codex style

```yaml
---
name: pdf
description: Use when tasks involve reading, creating, or reviewing PDF files...
---
```

Plus optional `agents/openai.yaml` for UI presentation:

```yaml
interface:
  display_name: "PDF Skill"
  short_description: "Create, edit, and review PDFs"
  icon_large: "./assets/pdf.png"
  default_prompt: "Create, edit, or review this PDF..."
```

### Scientific style

```yaml
---
name: literature-review
description: Conduct comprehensive, systematic literature reviews using multiple academic databases...
allowed-tools: Read Write Edit Bash
license: MIT license
metadata:
    skill-author: K-Dense Inc.
---
```

Extra fields (`allowed-tools`, `license`, `metadata`) are informational —
Codex and Claude Code ignore unknown frontmatter gracefully.

---

## Key Differences

### 1. Codex has `agents/openai.yaml`

Codex uses an optional `agents/openai.yaml` for richer metadata:
- `interface.display_name` — shown in TUI
- `policy.allow_implicit_invocation` — control auto-triggering
- `interface.default_prompt` — suggested starter prompt

Claude Code and the scientific skills don't use this file.

### 2. Scientific skills are much longer

Scientific skills tend to be 200-500+ lines with detailed workflows, database
lists, and mandatory figure requirements. Claude Code and Codex skills are
typically 30-100 lines.

Codex best practice recommends **skills under 150 lines** with progressive
disclosure (details in `references/` subdirectory).

### 3. `allowed-tools` field

Scientific skills declare `allowed-tools: Read Write Edit Bash`. This is
informational in the current Agent Skills spec — neither Codex nor Claude Code
enforces tool restrictions from frontmatter.

### 4. Installation paths

| Platform | Global skills | Project skills |
|---|---|---|
| Codex | `~/.codex/skills/<name>/SKILL.md` | `.agents/skills/<name>/SKILL.md` |
| Claude Code | `~/.claude/skills/<name>/SKILL.md` | `.claude/skills/<name>/SKILL.md` |

---

## What This Means For You

1. **Write skills in the common format** (`name` + `description` + markdown body)
   and they work in both Codex and Claude Code.

2. **Add `agents/openai.yaml`** only if you want Codex-specific UI metadata.

3. **Keep skills concise** (under 150 lines) per Codex best practice. Put
   detailed references in `references/` subdirectory.

4. **Scientific skills can be installed directly** — copy the folder to your
   skills directory. The extra frontmatter fields are harmless.

5. **The `description` field is the most important part** — it controls when
   the skill auto-triggers. Write it as a trigger condition, not a summary.

---

## Available Skills Worth Considering (Research Assistant)

### From `scientific-agent-skills` (135 skills)

Most relevant for a research assistant:

| Skill | Domain |
|---|---|
| `literature-review` | Systematic lit reviews with citation management |
| `scientific-writing` | IMRAD manuscripts, citation formatting |
| `paper-lookup` | Quick paper search and retrieval |
| `citation-management` | Reference management (BibTeX, etc.) |
| `scientific-critical-thinking` | Evaluate claims and methodology |
| `scientific-brainstorming` | Hypothesis generation |
| `exploratory-data-analysis` | EDA workflows |
| `statistical-analysis` | Stats methods and reporting |
| `scientific-visualization` | Publication-quality figures |
| `peer-review` | Structured peer review feedback |
| `hypothesis-generation` | Research question development |
| `matplotlib` / `seaborn` | Plotting libraries |
| `polars` / `pandas`-style | Data manipulation |
| `latex-posters` | Conference posters |
| `pptx` / `docx` / `pdf` | Document generation |

### From `claude-skills` (17 skills)

| Skill | Use case |
|---|---|
| `doc-coauthoring` | Collaborative document writing workflow |
| `pdf` | PDF creation and review |
| `pptx` | Presentation creation |
| `docx` | Word document creation |
| `xlsx` | Spreadsheet creation |
| `claude-api` | API integration reference |

### From `codex-skills` (curated)

| Skill | Use case |
|---|---|
| `pdf` | PDF handling with visual verification |
| `jupyter-notebook` | Notebook workflows |
| `gh-address-comments` | GitHub PR comment resolution |
| `gh-fix-ci` | CI failure debugging |
| `screenshot` | Visual capture |
