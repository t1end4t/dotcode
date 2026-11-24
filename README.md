# DotCode

A local dashboard for finding, installing, and managing GitHub repositories: CLIs, desktop apps, coding-agent skills, and MCP servers.

The UI shows the Library of saved Cards with server-side GitHub search and
installation controls. The assistant remains a preview.

## What You Can Do

- **Tools:** Browse GitHub projects, save notes, check releases, and manage installations through chat.
- **Agent setup:** Manage workspace skills, Model Context Protocol (MCP) servers, and instructions for Codex or Claude.

## Get Started

You need **Node.js and npm**. The assistant also needs **Codex installed and configured**; it uses your existing model and provider settings.

Run these commands from the repository root:

```bash
npm install
HOST=127.0.0.1 npm run dev
```

Open **http://127.0.0.1:3000**. The development server opens your browser automatically; set `BROWSER=none` to disable this.

For production:

```bash
npm run build
HOST=127.0.0.1 npm start
```

## Use the Assistant

In **Library**, open **Add repository**, then use **Search GitHub** to search by keyword or paste an
`https://github.com/owner/repo` URL. Results show stars, language, description,
latest release date and Detector badges. **Add** saves a Card with a suggested
category and detection results, without AI or installation. Adding the same repo
again keeps the existing Card. Install refreshes detection older than 24 hours.

GitHub requests use `GITHUB_TOKEN`, or `gh auth token` when available. Without a
token, search still works with lower anonymous limits and shows a warning.
Credentials stay on the server and are sent only to `api.github.com`.

Open the assistant from the header. Drag a tool card into chat to include its GitHub link, or use **Ask AI**.

Dropped tools appear as removable attachment cards. Drop, paste, or use **Attach images** to add PNG, JPEG, or WebP images (up to four per message, 5 MiB each). Images can be sent without text. They are included in that turn only; attach them again if a later message needs them. Image previews remain in the open conversation but are not saved across reloads. The server stages private image files under `DOTCODE_HOME` and removes them after the turn. Your configured Codex model must support image input.

Try requests such as:

```text
Add magnitudedev/magnitude to my library
Save this note for Magnitude: Evaluate for browser automation
Install Magnitude
Remove the Magnitude card
```

Use **Organize with AI** to group your library into categories.

### Before Making Changes

- A chat request authorizes the requested changes inside the managed workspace, without a separate approval dialog.
- Desktop launcher changes require separate approval. Runtime buttons and form submissions authorize their exact actions.
- Adding or removing a card does not install or uninstall its tool.
- Installed status requires a verified command or supported disk discovery; it does not guarantee that a tool runs correctly.
- The assistant is instructed to save `install.sh`, `update.sh`, `uninstall.sh`, and `verify.sh` under the managed workspace's `apps/<id>/`. Later operations reuse these scripts after inspection. Existing apps gain missing scripts during an authorized install or update; scripts are not created retroactively. Nix profile discovery exposes saved script paths, but does not verify their contents or execute them.
- Nix install/update scripts must register a permanent `apps/<id>/gc-root` after candidate verification and check it with `nix-store --query --roots`. This protects the rooted version and its dependencies from `nix-collect-garbage -d`, including when run with sudo. Existing scripts need repair during an authorized update; this policy is assistant-driven, not a server-enforced guarantee. Uninstall removes the root without collecting shared store paths.
- Failed or stopped operations can leave partial changes. Inspect them before retrying.
- “Missing successful verification command” means the receipt did not match a successful command event; it does not prove installation failed. Ask the assistant to inspect the existing installation, run its `verify.sh` as a standalone command, and register it without reinstalling.
- DotCode supplies the host OS release and inventory to the assistant. It is instructed to batch inspection, resolve commands through `PATH` (including on NixOS), and avoid unrelated app exploration. Lifecycle scripts, artifact verification, and launcher approval still apply; fewer steps are not guaranteed.

## Your Workspace

DotCode keeps managed data outside this repository, under `~/.dotcode` by default:

```text
.dotcode/
  workspace/       Tool sources and installation artifacts
  catalog.json     Your library, notes, and tags
  inventory.json   Installation records and run logs
```

This directory holds machine-local data, not application source. Keep it out of Git.

- Set `DOTCODE_HOME` to use another data directory. Existing data is not moved automatically.
- When migrating an older data directory, retain a symlink at its old location until stored installation paths and service references have been updated.
- The assistant uses `DOTCODE_HOME/workspace` (`~/.dotcode/workspace` by default). The dashboard has no folder picker; previously saved folder selections are ignored. Agent Setup forms apply to this workspace. GitHub skills installed from Cards activate globally for each agent.
- Keep one DotCode server running per machine. Logs may contain local paths and command output.

## Configuration

Set environment variables when starting the server. See `.env.example` for basic settings.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Bind address; use `127.0.0.1` for local-only listening. |
| `PORT` | `3000` | HTTP port. |
| `DOTCODE_HOME` | `~/.dotcode` | Managed data directory. |
| `BROWSER` | Default browser | Set to `none` to skip opening the browser in development. |
| `GITHUB_TOKEN` | Unset | Optional token for higher GitHub API limits; falls back to `gh auth token`. |

**Keep DotCode local.** The commands above restrict listening to this machine. The default bind address listens on all interfaces; do not expose DotCode as an unauthenticated public service.

## Development

Built with React, TypeScript, Vite, Express, and the Codex SDK. Server code is in `backend/`, the UI in `frontend/src/`.

### Library UI

`npm run dev` serves the Library UI at **http://127.0.0.1:3000/**,
and `npm run build` bundles it for `npm start`. The entry and styles are
`frontend/src/main.tsx` and `frontend/src/index.css`.

With the app open in an Orca browser tab, run
`node tests/check-ui.mjs <browserPageId>` for the UI interaction check.
For the app's Search/Add flow, run
`node tests/check-github-ui.mjs <browserPageId>` against a local app tab. Its
browser fixtures cover search recovery, stale responses and Add without writing Cards.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start development mode with file watching. |
| `npm test` | Run tests with Node's built-in test runner. |
| `npm run test:watch` | Rerun tests as files change. |
| `npm run lint` | Check TypeScript types. |
| `npm run build` | Type-check the frontend and tests, then bundle the frontend. |
| `npm start` | Serve the production build. |

`backend/server.ts` is the server entry point; `backend/instructions.md` defines the assistant's policy. `frontend/src/` contains the UI. `tests/` contains regression tests.

Production still needs the server source and dependencies. The build does not type-check the server.

### GitHub skills

On a Library Card, click **Install** to install a repository containing `SKILL.md`
(or legacy `skill.md`). When Detector finds a single skill, Install uses its
directory automatically, including nested skills. Git must be available on `PATH`.

The files Backend fetches the selected directory at an exact Git commit into
`DOTCODE_HOME/store/skills/<component>/<commit>`. Receipts live separately in
`DOTCODE_HOME/receipts.json`; the legacy inventory is unchanged. Installation
activates the skill globally for Codex (`~/.agents/skills/<name>`) and Claude
(`~/.claude/skills/<name>`). Each agent switch removes or recreates only its
symlink, without downloading the skill again. **Uninstall** removes both
Activations, the Store version and its Receipt, preserving the Card.

Existing files, real directories, foreign symlinks and symlinked parent
folders cause a conflict; DotCode leaves them untouched. Skills currently
support regular files and directories. Repositories without a skill marker
continue through the assistant's existing installation workflow.

### Nix CLI backend

The installer API supports CLI Recipes on NixOS. `POST /api/installer/detect`
with `{ "githubUrl": "https://github.com/owner/repo" }` returns ordered
`candidates` with a `recipe` and ranking `reason`: the repository's default
flake package first, then nixpkgs packages whose source or metadata matches
the repository. Variant selection is not implemented yet.
Discovery failures are returned in `warnings`; a failed nixpkgs lookup does
not prevent installing a detected flake.

Pass the chosen `recipe`, the same `githubUrl`, and `action: "install"` to
`POST /api/installer/plan`, then pass the returned `id` as `planId` to
`POST /api/installer/execute`. The Card must already be in the Library.
Nix installs pin the repository or nixpkgs revision and use `nix build` with
an out-link under `DOTCODE_HOME/store/nix/`. That out-link is the GC root.
No Nix profile, sudo, NixOS configuration or Home Manager changes are used.

The CLI wrapper has an ownership marker and calls the Store binary directly.
It goes in `~/.local/bin` when that directory is on the server's PATH;
otherwise it goes in `~/.dotcode/bin`, independent of `DOTCODE_HOME`.
`GET /api/installer` returns CLI Receipts with `activations.cli.path` and
`needsPath` so a UI can offer PATH setup guidance. Enable/disable plans use
the Receipt's `componentId` without an `agent`. Disable removes only the
wrapper; uninstall also removes the out-link and Receipt, leaving shared
Nix store paths for Nix GC.
