# Migrate Skills: Claude → Codex

Safe recipe for copying Claude skills into the Codex distribution in this repo.

## Source & Target

| | Claude | Codex |
|---|---|---|
| **Pack skills** | `claude/packs/<pack>/skills/<name>/` | `codex/packs/<pack>/skills/<name>/` |
| **Core skills** | `claude/core/skills/<name>/` | `codex/core/skills/<name>/` |
| **Install target** | `~/.claude/skills/` | `~/.codex/skills/` |

Note: core skill folders exist for future use, but are intentionally empty right now.

## 1. Copy Pack Skills

Use delete-then-copy. Avoid `cp -r src/ dst/`: if `dst` exists, it creates nested `dst/skills/...` paths.

```bash
for pack in claude/packs/*; do
  [ -d "$pack/skills" ] || continue
  name=$(basename "$pack")
  mkdir -p "codex/packs/$name"
  rm -rf "codex/packs/$name/skills"
  cp -a "$pack/skills" "codex/packs/$name/skills"
  [ -f "$pack/manifest.toml" ] && cp -a "$pack/manifest.toml" "codex/packs/$name/manifest.toml"
done
```

If `rsync` is available, this is equivalent and preserves deletion sync:

```bash
for pack in claude/packs/*; do
  [ -d "$pack/skills" ] || continue
  name=$(basename "$pack")
  mkdir -p "codex/packs/$name"
  rsync -a --delete "$pack/skills/" "codex/packs/$name/skills/"
  [ -f "$pack/manifest.toml" ] && cp -a "$pack/manifest.toml" "codex/packs/$name/manifest.toml"
done
```

All supporting subdirectories (`scripts/`, `references/`, `assets/`, `templates/`) come along.

## 2. Rewrite `SKILL.md` Frontmatter

Codex `SKILL.md` frontmatter should keep only fields supported by the official Codex skills docs:

```yaml
---
name: polars
description: Fast in-memory DataFrame library for datasets that fit in RAM...
---
```

Official docs: https://developers.openai.com/codex/skills

### Field Mapping

| Claude field | Codex action |
|---|---|
| `name` | Keep |
| `description` | Keep |
| `argument-hint` | Drop |
| `license` | Drop; keep existing `LICENSE.txt` if present |
| `metadata` | Drop |
| `compatibility` | Move into body as `## Requirements` if not already covered |
| `allowed-tools` | Move to `agents/openai.yaml` dependencies or body prose if important |
| `user-invocable` | Move to `agents/openai.yaml` policy if needed |
| `context` | Drop |
| `model` | Drop |
| `effort` | Drop |
| `hooks` | Drop |
| `paths` | Drop |

## 3. Optional `agents/openai.yaml`

Use only when a skill needs Codex UI metadata, dependency declarations, or invocation policy.

```yaml
policy:
  allow_implicit_invocation: false

dependencies:
  tools:
    - type: "mcp"
      value: "openaiDeveloperDocs"
      description: "OpenAI Docs MCP server"
      transport: "streamable_http"
      url: "https://developers.openai.com/mcp"
```

## 4. Verify

```bash
# Frontmatter should contain only name + description.
python3 - <<'PY'
from pathlib import Path
allowed = {"name", "description"}
failed = False
for path in Path("codex").rglob("SKILL.md"):
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        print(f"missing frontmatter: {path}")
        failed = True
        continue
    front = text.split("---", 2)[1]
    keys = {
        line.split(":", 1)[0].strip()
        for line in front.splitlines()
        if line.strip() and not line.startswith((" ", "-")) and ":" in line
    }
    extra = keys - allowed
    if extra:
        print(f"unexpected fields {sorted(extra)}: {path}")
        failed = True
raise SystemExit(1 if failed else 0)
PY
```

```bash
# Pack count parity.
echo "Claude packs: $(find claude/packs -mindepth 1 -maxdepth 1 -type d | wc -l)"
echo "Codex packs:  $(find codex/packs -mindepth 1 -maxdepth 1 -type d | wc -l)"
echo "Claude pack skills: $(find claude/packs -name SKILL.md | wc -l)"
echo "Codex pack skills:  $(find codex/packs -name SKILL.md | wc -l)"
echo "Codex core skills:  $(find codex/core/skills -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)"
```

```bash
# No accidental nested copy.
find codex -path '*/skills/skills' -type d -print
```

## Current Inventory

### Core Skills (1)

- `hpc-training`

### Claude Pack Source (49)

| Pack | Count |
|---|---:|
| `data-analysis` | 13 |
| `deep-learning` | 6 |
| `office-tools` | 4 |
| `research-workflow` | 9 |
| `scientific-reasoning` | 6 |
| `scientific-visualization` | 6 |
| `scientific-writing` | 5 |

### Codex Packs Before Full Migration (35)

| Pack | Count |
|---|---:|
| `data-analysis` | 6 |
| `deep-learning` | 5 |
| `office-tools` | 4 |
| `research-workflow` | 6 |
| `scientific-reasoning` | 5 |
| `scientific-visualization` | 6 |
| `scientific-writing` | 3 |
