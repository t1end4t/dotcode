# DotCode

A local dashboard for finding, installing, and managing GitHub repositories: CLIs, desktop apps, coding-agent skills, and MCP servers.

The UI shows the Library of saved Cards with server-side GitHub search and
installation controls. 
## What You Can Do

- **Library:** Search GitHub, save repositories as Cards, and check releases.
- **Install:** Install skills (files Backend) and CLIs (Nix Backend) from a Card.

## Get Started

You need **Node.js 24 and npm**.

Run these commands from the repository root:

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:3000**. The development server opens your browser automatically; set `BROWSER=none` to disable this.

For production:

```bash
npm run build
npm start
```

## Use the Library

In **Library**, open **Add repository**, then use **Search GitHub** to search by keyword or paste an
`https://github.com/owner/repo` URL. Results show stars, language, description,
latest release date and Detector badges. **Add** saves a Card with a suggested
category and detection results, without AI or installation. Adding the same repo
again keeps the existing Card. Install refreshes detection older than 24 hours.

GitHub requests use `GITHUB_TOKEN`, or `gh auth token` when available. Without a
token, search still works with lower anonymous limits and shows a warning.
Credentials stay on the server and are sent only to `api.github.com`.

The **Unmanaged** section shows local CLIs, user units, skills, subagents, plugins,
and older app installs without a Receipt. The scan is read-only and flags name
and port conflicts. If an existing install blocks a new one, resolve it yourself;
DotCode does not remove it or run its old lifecycle scripts.

### Ask the Assistant

Select **Ask assistant** on a Card, or open **Assistant** and include a GitHub
repository name or URL in your question. The integrated Codex SDK reads repository
metadata and READMEs through a server-enforced subset of DotCode’s read-only
MCP tools. The Assistant disables Codex’s shell and code mode and starts in a
read-only sandbox with network access and approvals disabled. This constrains
sandboxed commands, not Codex itself: Codex still contacts its provider and
DotCode MCP. The sandbox is not a filesystem read boundary.

Set `OPENAI_API_KEY` in the server environment, or sign in with `codex login`
using Codex’s default file-backed credential store. DotCode’s bundled Codex reads
`auth.json` from the server’s `CODEX_HOME` (default `~/.codex`). It ignores
`config.toml`, including any setting that changes the credential store, so a
keyring-only login is not sufficient. It also ignores rules, hooks, plugins,
memories, and your MCP servers. Codex still reads `$CODEX_HOME/AGENTS.md` and
may read personal skills. Chat history stays in the open page; each request
sends recent turns to Codex, and reloading clears it.

## Your Workspace

DotCode keeps managed data outside this repository, under `~/.dotcode` by default:

```text
.dotcode/
  catalog.json     Your library, notes, and tags
  inventory.json   Installation records and run logs
  mcp-token        Bearer token for /mcp (owner read/write only)
```

This directory holds machine-local data, not application source. Keep it out of Git.

- Set `DOTCODE_HOME` to use another data directory. Existing data is not moved automatically.
- When migrating an older data directory, retain a symlink at its old location until stored installation paths and service references have been updated.
- Keep one DotCode server running per machine. Logs may contain local paths and command output.

## Configuration

Set environment variables when starting the server. See `.env.example` for basic settings.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | HTTP bind address. |
| `PORT` | `3000` | HTTP port. |
| `DOTCODE_HOME` | `~/.dotcode` | Managed data directory. |
| `BROWSER` | Default browser | Set to `none` to skip opening the browser in development. |
| `GITHUB_TOKEN` | Unset | Optional token for higher GitHub API limits; falls back to `gh auth token`. |

**Keep DotCode local.** Do not expose it as an unauthenticated public service, including through a reverse proxy. DotCode listens only on loopback by default. Changing `HOST` changes the listener address; API writes still require a loopback connection, a local `Host`, and a same-origin `Origin` header if sent.

The loopback check uses the immediate socket peer. A reverse proxy that connects to DotCode over loopback is inside that trust boundary: DotCode sees the proxy as the peer even when the original client is remote. The Assistant’s HTTP route does not authenticate the browser separately; another local OS user can reach it even without the MCP token. Do not run it with provider credentials on a machine shared with untrusted users.

## Ask an agent over MCP

DotCode serves a read-only MCP endpoint at `http://127.0.0.1:3000/mcp`
(Streamable HTTP, JSON responses). Tools:

| Tool | Returns |
| --- | --- |
| `search` | GitHub search results with Detector badges, like Search in the UI. |
| `repo_info` | Repository metadata, README, and the Library Card if one exists. |
| `detect` | Ranked candidate Recipes from the Detector. |
| `list_components` | Installed Components from Receipts, with Activation status. |
| `list_unmanaged` | The read-only Unmanaged inventory and its conflict warnings. |

No tool adds Cards, writes Receipts, or installs anything. `search` and `detect`
may evaluate a repository's flake, which can fetch its source into the Nix store.

Each request needs a loopback connection, a local `Host`, no foreign `Origin`,
and `Authorization: Bearer <token>`. DotCode creates the token on first start in
`DOTCODE_HOME/mcp-token` with mode `0600`. To rotate it, delete the file and
restart DotCode.

Connect Codex CLI (`~/.dotcode` is the default `DOTCODE_HOME`):

```sh
codex mcp add dotcode --url http://127.0.0.1:3000/mcp --bearer-token-env-var DOTCODE_MCP_TOKEN
export DOTCODE_MCP_TOKEN="$(cat ~/.dotcode/mcp-token)"   # in the shell that starts codex
```

Connect Claude Code:

```sh
claude mcp add --transport http dotcode http://127.0.0.1:3000/mcp \
  --header 'Authorization: Bearer ${DOTCODE_MCP_TOKEN}'
export DOTCODE_MCP_TOKEN="$(cat ~/.dotcode/mcp-token)"   # in the shell that starts claude
```

The single quotes keep `${DOTCODE_MCP_TOKEN}` unexpanded, so Claude's config stores
the reference and reads the token from the environment at startup.

## Development

Built with React, TypeScript, Vite, and Express. Server code is in `backend/`, the UI in `frontend/src/`.

### Library UI

`npm run dev` serves the Library UI at **http://127.0.0.1:3000/**,
and `npm run build` bundles it for `npm start`. The entry and styles are
`frontend/src/main.tsx` and `frontend/src/index.css`.

With the app open in an Orca browser tab, run
`node tests/check-ui.mjs <browserPageId>` for the UI interaction check.
For Search/Add and Assistant, run `node tests/check-github-ui.mjs <browserPageId>`
against a local app tab. Browser fixtures cover Search/Add and chat replies,
sign-in errors, and connection errors without writing Cards or calling Codex.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start development mode with file watching. |
| `npm test` | Run tests with Node's built-in test runner. |
| `npm run test:watch` | Rerun tests as files change. |
| `npm run lint` | Check TypeScript types. |
| `npm run build` | Type-check the frontend and tests, then bundle the frontend. |
| `npm start` | Serve the production build. |

`backend/server.ts` is the server entry point and `backend/api.mjs` holds the API routes. `frontend/src/` contains the UI. `tests/` contains regression tests.

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
are not installable yet.

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
