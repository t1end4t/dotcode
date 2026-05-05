# Migrate Skills: Claude → Codex

Step-by-step instruction for copying all Claude Code skills into the Codex CLI distribution.

## Source & Target

| | Claude | Codex |
|---|---|---|
| **Core skills** | `claude/core/skills/<name>/` | `codex/core/skills/<name>/` |
| **Pack skills** | `claude/packs/<pack>/skills/<name>/` | `codex/packs/<pack>/skills/<name>/` |
| **Install target** | `~/.claude/skills/` | `~/.codex/skills/` |

## Checklist

### 1. Copy directory trees

```bash
# Core skills
cp -r claude/core/skills/ codex/core/skills/

# Packs — copy entire pack directories (skills + manifest.toml)
for pack in claude/packs/*/; do
  name=$(basename "$pack")
  mkdir -p "codex/packs/$name"
  [ -d "$pack/skills" ] && cp -r "$pack/skills" "codex/packs/$name/skills"
  [ -f "$pack/manifest.toml" ] && cp "$pack/manifest.toml" "codex/packs/$name/manifest.toml"
done
```

All supporting subdirectories (`scripts/`, `references/`, `assets/`, `templates/`) come along — no changes needed.

### 2. Rewrite SKILL.md frontmatter

Every `SKILL.md` needs its YAML frontmatter translated. The body content stays **unchanged**.

#### Field mapping

| Claude field | Action | Codex equivalent |
|---|---|---|
| `name` | **Keep** | Same |
| `description` | **Keep** | Same |
| `argument-hint` | **Keep** | Same |
| `license` | **Drop** | Not a Codex frontmatter field. Move to `LICENSE.txt` if not already present |
| `metadata` | **Drop** | Not a Codex frontmatter field |
| `compatibility` | **Drop** | Not a Codex frontmatter field. Move note into SKILL.md body under a `## Requirements` section |
| `allowed-tools` | **Drop** | Not supported. If important, add as prose in SKILL.md body: "This skill works best when the agent has access to: ..." |
| `user-invocable` | **Drop** | Use `agents/openai.yaml` with `policy.allow_implicit_invocation` instead, only if needed |
| `context` | **Drop** | Not supported in Codex |
| `model` | **Drop** | Not supported in Codex |
| `effort` | **Drop** | Not supported in Codex |
| `hooks` | **Drop** | Not supported in skill frontmatter |
| `paths` | **Drop** | Not supported in Codex |

#### Minimal result

```yaml
---
name: data-analysis:polars
description: Fast in-memory DataFrame library for datasets that fit in RAM. ...
---
```

Only `name` and `description` survive. Add `argument-hint` if the original had it.

### 3. Handle dropped fields case-by-case

For each skill, check if a dropped field carries info that should be preserved:

- **`allowed-tools`** — 12 skills have this. If the skill body already references those tools by name in its instructions, no action needed. Otherwise add a note.
- **`license`** — If the skill directory already has `LICENSE.txt`, do nothing. If `license:` was the only place the license was noted, create `LICENSE.txt`.
- **`compatibility`** — 2 skills have this. Move the text into the skill body as a `## Requirements` section near the top.
- **`metadata.skill-author`** — Informational only. Can be preserved as a comment at the top of SKILL.md or dropped entirely.

### 4. Create `agents/openai.yaml` (optional)

Only needed if a skill had `user-invocable: false` or other policy needs. Most skills won't need this.

```yaml
# codex/core/skills/weather-fetcher/agents/openai.yaml
policy:
  allow_implicit_invocation: false
```

### 5. Update `codex/AGENTS.md` inventory

Add all migrated skills to the inventory following the existing format. Core skills go under `## Core`, pack skills under their pack heading.

### 6. Verify

```bash
# All SKILL.md files should have only name/description/argument-hint in frontmatter
for f in $(find codex/ -name 'SKILL.md'); do
  echo "=== $f ==="
  sed -n '2,/^---$/p' "$f" | grep -vE '^\s*(name|description|argument-hint|---)' && echo "  ⚠ unexpected fields" || echo "  ✅ clean"
done
```

```bash
# Pack count should match
echo "Claude packs: $(ls -d claude/packs/*/ 2>/dev/null | wc -l)"
echo "Codex packs:  $(ls -d codex/packs/*/ 2>/dev/null | wc -l)"
echo "Claude skills: $(find claude/ -name 'SKILL.md' | wc -l)"
echo "Codex skills:  $(find codex/ -name 'SKILL.md' | wc -l)"
```

## Current Inventory (31 skills)

### Core (2)
- `skill-creator` — Create, edit, eval, optimize skills
- `mcp-builder` — Guide for creating MCP servers

### Packs (29)

| Pack | Skills |
|---|---|
| `data-analysis` | `statistical-analysis`, `exploratory-data-analysis`, `database-lookup`, `polars`, `dask`, `markitdown` |
| `deep-learning` | `transformers`, `optimize-for-gpu`, `pytorch-lightning` |
| `office-tools` | `xlsx`, `pptx`, `pdf`, `docx` |
| `research-workflow` | `literature-review`, `citation-management`, `paper-lookup`, `research-lookup` |
| `scientific-reasoning` | `scientific-brainstorming`, `scientific-critical-thinking`, `hypothesis-generation` |
| `scientific-visualization` | `scientific-visualization`, `scientific-schematics`, `matplotlib`, `seaborn`, `markdown-mermaid-writing`, `infographics` |
| `scientific-writing` | `peer-review`, `scientific-writing`, `venue-templates` |
