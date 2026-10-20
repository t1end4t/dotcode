# DotCode

Dashboard for GitHub tools, plugins, coding-agent skills, and MCPs. The assistant uses your local `codex` login/config through `@openai/codex-sdk`.

Codex must be installed and configured separately. DotCode does not download or serve local LLMs and does not require a Gemini key. `instructions.md` defines its tool-management behavior.

Requests are planned read-only first. Approval runs that exact plan in a workspace-write sandbox. Installed state appears only after Codex reports a successful verification command. Managed data is separate from this application's source:

- `~/codebases/dotcode-workspace/workspace/`: SDK working directory, tool sources, installation artifacts, and tool-local Nix files/profiles.
- `~/codebases/dotcode-workspace/catalog.json`: catalog entries, notes, tags, and category labels.
- `~/codebases/dotcode-workspace/inventory.json`: verified installation receipts, AI category assignments, and run logs.

Set `DOTCODE_HOME` to change where DotCode keeps `catalog.json`, `inventory.json`, and its default Codex folder. Click the folder control in the chat header to open a modal folder picker: click a subfolder, use Parent or Home to navigate, then click **Use this folder**. Escape, Cancel, or the close button dismisses the picker and returns focus to the folder control. No path typing is required. The read-only browser lists non-hidden subdirectories, not files or symlink entries. Root and Home are navigation locations, not valid working folders. Changing the folder does not change the catalog, categories, or inventory. Pending approvals stay bound to the folder where planning happened. The selected folder must not be the filesystem root, home folder, DotCode data folder, DotCode source, or `~/nix-dev/nixos-conf`, including through symlinks. Approved execution can write inside the selected folder only. Disk discovery still checks the default `workspace/apps/<catalog-id>/profile` location. Existing data and installations are not automatically moved, removed, or migrated.

Drag catalog cards or table rows into chat to append their GitHub links without sending a message. The existing Ask AI buttons also work without dragging. Category tabs come from the catalog rather than a fixed list. Use **Organize with AI** to regroup the catalog. AI assignments persist in the inventory as dashboard metadata, without installation approval or changes to installed tools. Existing fixed categories become Uncategorized until AI assigns new groups.

Chat manages cards as well as installed tools. Say **Add magnitudedev/magnitude**, **Rename its card**, **Save this note for Magnitude**, or **Remove the Magnitude card**. The assistant returns structured catalog changes; the application validates them and saves `catalog.json` under `DOTCODE_HOME`, then refreshes the dashboard automatically. Card details are read-only; action shortcuts prepare a chat request rather than editing data directly. Browser tabs do not automatically save their displayed catalog over chat changes. Existing catalogs cannot be overwritten through the initialization endpoint.

**Install**, **Update**, and **Uninstall** requests still require an approved installation plan and a successful verification command. An install request for a new repository can add its card while preparing the plan, but it does not mark the tool installed before verified execution. Adding a card does not install it. Removing a card does not uninstall its tool or erase its installation receipt, and inventory refresh does not recreate removed cards. Uninstalling keeps the card unless removal was also requested. The starter catalog in the application source is only a first-load fallback; chat never edits it or `untitled.md`.

Say **Mark 9Router as installed** to register an existing installation, including a global npm package outside the workspace. Approve the read-only verification plan; after a successful check, DotCode saves a `register` inventory receipt and refreshes the installed card state. This does not reinstall, migrate, or modify the existing tool. The assistant checks package identity and installed artifacts and records the observed location/version. Installed state does not establish runtime health. Updates or removal outside the selected working folder still require manual steps or a separate migration plan.

Planning and execution disable configured MCP servers because their external mutations are not constrained by a filesystem sandbox. Native web search remains available for documentation.

Approval authorizes the whole plan, not each shell command. The SDK has no interactive approval UI here; blocked operations require manual steps, not relaxed sandboxing. Codex judges which verification is appropriate; matching a successful command is an execution receipt, not independent proof that the tool works. Failed/stopped turns may leave partial changes. Inspect before retrying. Logs can contain local paths and command output; keep the inventory private. Run only one DotCode server per machine. Chat catalog changes are validated as a batch and written with an atomic file replacement; the application does not provide a transaction across catalog and inventory files.

The eraser button clears the visible chat. Chat keeps intermediate messages, tool steps, command output, and elapsed time in a collapsible section for each answer. The final answer appears separately. Chat renders headings, lists, bold text, inline code, and fenced code blocks; long commands and code blocks scroll separately and never turn code URLs into links. Nested Markdown and tables are not supported. Planning requests include an explicit JSON schema. If the configured provider returns plain text instead, chat displays it without an approval button; execution still requires valid structured output and verified commands. The application does not override your configured model or provider.

The composer highlights HTTP(S) URLs while typing. Sent messages and replies show clickable URLs with GitHub or globe icons; links open in a new tab. Highlighting does not change the submitted text.

When `catalog.json` does not exist, the first browser load imports its existing saved catalog and notes, or seeds the template catalog. Later loads use the JSON file rather than browser storage. Old simulated installation/version flags are ignored. If moving an existing installation, copy `~/.local/share/dotcode/inventory.json` into the new root before starting; preserve the original as a backup. Inventory combines agent-recorded installations with read-only disk discovery of catalog tools under `workspace/apps/<catalog-id>/profile`. Discovery currently supports Nix version 3 profile manifests with active packages and existing executable files; a directory, source checkout, build result, or empty profile alone is not an installation. It does not run tool binaries or rewrite `inventory.json`. Both dashboard inventory and agent context use the discovered state; refresh the page after standalone CLI changes. DotCode supports install, update, and uninstall operations, not tool enable/disable controls. Legacy activation fields in saved data are unused; installed state does not establish runtime health. Per-item update buttons compare each cataloged repository's latest stable GitHub release with the installed version, without installing anything. Results last until reload. Prereleases, non-release tags, and non-numeric versions require manual review. Unauthenticated GitHub checks are rate-limited, so checking the whole catalog can fail partway. Other installation methods still need agent-recorded receipts; this is not a full machine scan. General runtime/service controls and model management are not implemented.

## Run

```bash
npm install
npm run dev
```

The development server opens <http://127.0.0.1:3000> in your default browser automatically. Set `BROWSER=none` to disable this, for example `BROWSER=none npm run dev`.

## Scripts

```bash
npm run dev     # root Express server with Vite middleware
npm test        # run every tests/*.test.* file
npm run test:watch # rerun tests while developing
npm run build   # type-check and bundle the frontend
npm run start   # serve frontend/dist using the root server (tsx)
```

All tests live in the root `tests/` folder. New `*.test.mjs`, `*.test.ts`, and
`*.test.tsx` files run automatically with `npm test` and `npm run test:watch`.

`server.ts` is the only server entry point. The production server runs from
source; build the frontend before starting it. Catalog loading and saving live
in `frontend/src/useCatalog.ts`; dashboard layout stays in `frontend/src/App.tsx`.
