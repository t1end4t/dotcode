Use `direnv exec . <command>` for development commands; direnv provides the repo's tools and dependencies.
Before installing a missing tool, check it inside direnv and inspect `flake.nix`.

- `npm test`: run the test suite (`node --test`).
- `npm run lint`: type-check frontend and backend.
- `npm run dev`: start the dev server on port 3000.

Run `lint` and `test` before committing; CI runs both on every push and PR.

## Agent skills

### Issue tracker

Track issues and specs in GitHub Issues for `t1end4t/dotcode`.
See `docs/agents/issue-tracker.md`.

### Domain docs

Use a single-context layout: root `GLOSSARY.md` and `docs/adr/`.
See `docs/agents/domain.md`.
