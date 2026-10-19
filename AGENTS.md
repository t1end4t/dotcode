# AGENTS.md

This is a TypeScript execution repo created from a Nix template.

## Init-stage behavior

- First, check whether `docs/` exists and contains enough project context to start work.
- If project context is missing, suggest bridging context from `~/second-brain/1-Projects/<project>/` into this repo's `docs/` folder.
- Treat `~/second-brain/1-Projects/<project>/` as the source of truth for planning/thinking; treat `docs/` as execution-ready context.
- Do not create or edit the bridge unless the user asks.

## Template intent

- Keep this file as agent startup guidance only.
- Do not document repo structure here.
- Prefer minimal, project-local changes.
