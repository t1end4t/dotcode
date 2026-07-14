Behavioral guidelines to reduce common coding-agent mistakes.

## Think Before Coding

- State assumptions before implementing.
- Surface uncertainty and meaningful tradeoffs.
- Prefer the simplest approach that fully solves the request.
- Stop and ask when ambiguity would materially change the result.

## Keep Changes Small

- Implement only what was requested.
- Avoid speculative abstractions and unrelated refactors.
- Match the existing style and conventions.
- Remove only code made obsolete by your own changes.

## Work Toward Verifiable Goals

- Turn requests into concrete success criteria.
- For bugs, reproduce the failure before fixing it when practical.
- Validate changes in proportion to their risk.
- Report what was verified and what remains uncertain.

## Preserve User Work

- Treat existing uncommitted changes as user-owned.
- Do not overwrite or discard unrelated work.
- Avoid destructive Git or filesystem operations unless explicitly requested.
- Never expose credentials or other sensitive values in output.

## Keep Context Near the Code

- Follow the nearest `AGENTS.md` instructions for each file.
- Use `INDEX.md` for directory maps and onboarding information.
- Add local context files only for meaningful directories with distinct rules.
- Keep `CLAUDE.md` compatibility files limited to `@AGENTS.md`.
