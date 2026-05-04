# Codex Setup Plan — Research Assistant

> Generated reference for tailoring Codex CLI to a research-assistant workflow.
> Answer the open questions at the bottom, then we build it out.

---

## Feature Map

### 1. AGENTS.md — Project Personality

- One per project/repo you work with regularly. Keep under 150 lines.
- For research repos: describe the domain, key papers/datasets, conventions,
  preferred citation style, build/run commands.
- The global base lives in `core/AGENTS.md` (already set up).

### 2. Skills — Reusable Workflows ⭐ Highest Value

Skills are instruction packages triggered by description match or `$skill-name`.
Candidates:

| Skill | Trigger description |
|---|---|
| `literature-review` | Survey papers on a topic → structured comparison table |
| `paper-summarizer` | Given a paper, extract contributions, methods, results, limitations |
| `experiment-logger` | Structure experiment results as markdown tables with metrics |
| `writing-assistant` | Edit research writing for clarity, grammar, academic tone |
| `citation-formatter` | Format references in a target citation style |
| `code-reviewer` | Review code for correctness, style, edge cases |

Location: `~/.codex/skills/<name>/SKILL.md` (global) or `.agents/skills/<name>/SKILL.md` (per-project).

### 3. Hooks — Automated Triggers

Requires `[features] codex_hooks = true` in config.

| Hook | Purpose |
|---|---|
| `SessionStart` | Inject current project context (project name, deadline, focus areas) |
| `Stop` | Auto-append session summary to a research log file |

### 4. Subagents — Parallel Specialized Workers

Use for large parallel tasks:

- Review a paper from multiple angles (methods, novelty, reproducibility)
- Explore a large codebase with multiple questions at once
- Multi-source literature search

Custom agent candidates: `paper-reviewer`, `code-explorer`, `data-analyst`.
Each gets its own `.codex/agents/<name>.toml` with tailored instructions.

### 5. Config Profiles — Context Switching

Switch with `codex --profile <name>`.

| Profile | Sandbox | Approval | Use case |
|---|---|---|---|
| `research` | workspace-write | on-request | Daily work |
| `review` | read-only | on-request | Paper/code review, no accidental edits |
| `trusted` | workspace-write | never | Automation scripts |

### 6. Memories — Cross-Session Learning

Learns preferences, project context, patterns across sessions.

```toml
[features]
memories = true

[memories]
use_memories      = true
generate_memories = true
```

Set `no_memories_if_mcp_or_web_search = true` if handling sensitive data.

### 7. MCP Servers — External Tool Integration

| Server | Purpose |
|---|---|
| `filesystem` | Work across directories |
| `github` | PR reviews, issue tracking |
| Notes system (Obsidian/Notion) | Integrate with your knowledge base |

### 8. Marketplace/Plugins

Browse pre-built skills and plugins via `/plugins`. Install what's useful.

---

## Open Questions (answer these to proceed)

1. **Scope**: Start with skills + config (recommended), full setup, or just config + memories?
2. **Domain**: CS/AI/ML, or general/mixed research?
3. **Note system**: Obsidian, Notion, or none?
4. **Which skills**: From the table above — which ones do you actually want? Others?
