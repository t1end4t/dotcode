# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`dotclaude` is **not an application** — it is a personal distribution of configuration, skills, agents, commands, and hooks for **Claude Code**. The `install.sh` script copies files from this repo into `~/.claude/` and `~/.config/environment.d/`. Editing this repo means editing a source-of-truth that gets materialized into those home directories on install.

The philosophical framing lives in `BLUEPRINT.md` (a layered AI-OS vision) and condensed tips live in `best-practice.md`. Read them before making non-trivial structural changes.

## Top-level layout

```
core/           Layer 0 — base config installed with `--core`
  manifest.toml               Declares what core installs
  settings.json             Harness config (sandbox, permissions, hooks, plugins)
  CLAUDE.md                 Global behavioral rules for Claude Code
  hooks/                    Installed to ~/.claude/hooks/
  environment.d/              Copied to ~/.config/environment.d/ (skipped if dest exists)

packs/          Opt-in domain packs installed with `--pack=NAME`
  <pack>/       Each pack has its own manifest.toml and a skills/ directory.

guide/          Reference docs, tutorials, and patterns — NOT installed as config.
                install.sh only records its path in ~/.claude/guide-path.
                guide/CLAUDE.md is a subagent reference, not a project-level CLAUDE.md.

install.sh      The entire "build system" (no Make/just/npm).
uninstall.sh    Symmetric removal by filename.
BLUEPRINT.md    Nine-layer design doc; read for high-level intent.
best-practice.md  Concept table + tips for prompts, plans, agents, skills, commands, hooks.
```

## Common commands

```bash
./install.sh --list                             # Show available packs and file counts
./install.sh --core                             # Install only core (Layer 0)
./install.sh --mcp                              # Install MCP servers (fetch, context-mode)
./install.sh --pack=local-llm                   # Install a single pack
./install.sh --pack=infra --pack=data-science   # Multiple packs in one invocation
./uninstall.sh ...                              # Same flags, reverses install
```

There is no build step, no test suite, no linter. "Testing a change" means running `./install.sh --pack=<name>` against a local environment and exercising the installed skill/agent/command in Claude Code.

## How install.sh works (things to know before editing it)

- **Copies, does not symlink** — edits to the repo do not propagate until you re-run `install.sh`.
- **Hooks are chmod +x'd** after install — new hook scripts must be shell-executable.
- **Packs install skills by directory** (`packs/<pack>/skills/<skill>/`), and **each skill directory must contain a `SKILL.md`** or `install_pack()` silently skips it. This is the single most common reason a new skill "doesn't install."
- **`environment.d` files are skipped if the destination already exists** (never overwritten), unlike everything else.
- `install.sh` writes `$SCRIPT_DIR/guide` to `~/.claude/guide-path` so other tools can find the guide docs.

## Pack manifest format

Every pack (and `core/`) has a `manifest.toml` with this shape:

```toml
[pack]
name = "local-llm"
description = "Route lightweight tasks to local llama-server to save API tokens"
version = "1.0.0"

[claude]
skills = "skills"
```

Note: `install.sh` **does not actually parse the manifest** beyond grepping `description` for `--list` output. Installation is driven by directory conventions (`skills/`), not manifest declarations. The manifest is documentation for humans.

## Where to put what

| Change                              | Edit                                                        |
| ----------------------------------- | ----------------------------------------------------------- |
| Global Claude Code behavior rules   | `core/CLAUDE.md`                                |
| Harness / permissions / hooks / MCP | `core/settings.json`                            |
| A new general-purpose skill         | `core/skills/<name>/SKILL.md` *or* a pack       |
| A domain-specific skill             | `packs/<pack>/skills/<name>/SKILL.md`          |
| A new pack                          | `packs/<name>/{manifest.toml,skills/}`          |
| Shell env vars for the whole system | `core/environment.d/<file>.sh`                              |

Prefer adding to an existing pack over creating a new one. A new pack should represent a cohesive domain (like `scientific-writing`), not a single skill.

## The cognition-modes pack

`packs/cognition-modes/` provides three skills (`/cognition-modes:think`, `/cognition-modes:draft`, `/cognition-modes:do`) that act as explicit mode-switches for tool-for-thought behavior. Each SKILL.md inlines a compact identity block so the skill works in any project-repo, not just in `~/second-brain/`.

The companion `SECOND-BRAIN-CLAUDE.md` in the pack directory is a per-repo CLAUDE.md template for `~/second-brain/` — it makes tool-for-thought the ambient default without a skill invocation. It is **not** installed by `install.sh`; copy it to `~/second-brain/CLAUDE.md` manually.

## Session workflow

On session start, read `../../second-brain/1-Projects/dev-sandbox/dotclaude/journal.md`. Present the first unchecked Todo item along with any relevant Decisions context, and ask if the user wants to proceed.

On session end, update the same journal: check off completed todos, update status if it changed, log any non-obvious decisions, and add open questions or new ideas to the journal section.

## Conventions worth following

- **Skills are directories, not single files.** A `SKILL.md` is required; `references/`, `scripts/`, and `examples/` subdirectories are conventional. See `best-practice.md` for the full pattern.
- **Keep CLAUDE.md files short** (< 200 lines is the documented target). If rules grow, split into `.claude/rules/` or use `<important if="...">` tags.
- **Don't dump content into `guide/` expecting it to install.** `guide/` is read-only reference material that users browse from their installed `~/.claude/guide-path` pointer.
- **settings.json changes are harness-level** — they affect sandbox, permissions, hooks, and plugins, which Claude cannot override at runtime. Use `settings.json` for deterministic behavior; use `CLAUDE.md` files for guidance.
