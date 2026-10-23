# Agent Instructions

## Scope

- DotCode is a local dashboard for developer tools with an approval-based assistant.
- Read `README.md` for setup, behavior, and known limits. Keep user documentation there.
- Keep changes small. Preserve unrelated working-tree edits. Do not add dependencies or abstractions without a concrete need.

## Editing

- Keep HTTP startup, same-origin checks, and static/Vite serving in `server.ts`. It is the only server entry point.
- Edit `agent.mjs` for agent execution, API handlers, catalog validation, and inventory persistence. Keep its security tests in `tests/agent.test.mjs`.
- Edit `instructions.md` for the application's runtime assistant policy. It is loaded at runtime; do not delete it as unused documentation.
- Keep dashboard layout in `frontend/src/App.tsx`, catalog loading/saving in `frontend/src/useCatalog.ts`, and installation/category merging in `frontend/src/inventory.ts`.
- Keep chat and approval UI in `frontend/src/components/AiPane.tsx`. Put other UI changes in the existing matching component.
- Treat `frontend/src/data/items.ts` as initial catalog data, not the user's live catalog. Preserve browser-storage migration unless explicitly replacing it.
- Keep frontend dependencies in `frontend/package.json`; keep server dependencies and shared tooling in root `package.json`. Update `bun.lock` with Bun when manifests change.

## Safety

- Keep API access local and same-origin. Never weaken approval gates, sandboxing, path isolation, or boundary validation.
- Planning is read-only. Execution uses an approved plan. Do not infer installation success from catalog metadata or a source checkout.
- Keep managed tools and user data under `DOTCODE_HOME` (default `~/.dotcode`), separate from application source and NixOS/Home Manager configuration.
- Tests must use temporary directories and mocks. Do not invoke real installations or modify the user's live catalog or inventory.
- Preserve keyboard access, labels, focus handling, and responsive layouts when changing UI.

## Validation

- `npm test`: runs every `tests/*.test.*` file (agent security/persistence and frontend regression tests) using Node's built-in test runner. Put new tests in `tests/`.
- `npm run build`: frontend and `tests/` TypeScript check and production bundle. It does not type-check the server.
- `npm run dev`: local server with Vite middleware at `http://127.0.0.1:3000`.
- `npm start`: production server; build the frontend first. The server runs from source using `tsx`.
- Run relevant tests and the build after refactoring. Report failures and untested behavior explicitly. Do not add a test framework.
- Use test-driven development for behavior changes: add or update a focused test, confirm it fails for the expected reason, then implement until it passes.
- Run tests and builds directly, and check their output and exit status.
