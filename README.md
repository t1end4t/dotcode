# DotCode

A local dashboard for developer tools, services, models, and coding agents.

## What You Can Do

- **Tools:** Browse GitHub projects, save notes, check releases, and manage installations through chat.
- **Services:** Start, stop, and configure user-level systemd services. View logs and control autostart.
- **Models:** Import or download GGUF files, run local inference, or connect to a local OpenAI-compatible server.
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

Service management requires Linux with user-level systemd. Local model inference requires `llama-server` or an existing compatible server.

## Use the Assistant

Open the assistant from the header. Drag a tool card into chat to include its GitHub link, or use **Ask AI**.

Try requests such as:

```text
Add magnitudedev/magnitude to my library
Save this note for Magnitude: Evaluate for browser automation
Install Magnitude
Remove the Magnitude card
```

Use **Organize with AI** to group your library into categories.

### Before Making Changes

- A chat request authorizes the requested changes inside the selected target folder, without a separate approval dialog.
- Desktop launcher changes require separate approval. Runtime buttons and form submissions authorize their exact actions.
- Adding or removing a card does not install or uninstall its tool.
- Installed status requires a verified command or supported disk discovery; it does not guarantee that a tool runs correctly.
- Failed or stopped operations can leave partial changes. Inspect them before retrying.

## Your Workspace

DotCode keeps managed data outside this repository, under `~/codebases/dotcode-workspace` by default:

```text
dotcode-workspace/
  workspace/       Tool sources and installation artifacts
  catalog.json     Your library, notes, and tags
  inventory.json   Installation records and run logs
  runtime/         Service state, units, and backups
  models/          Local model files
```

- Set `DOTCODE_HOME` to use another data directory. Existing data is not moved automatically.
- Use **Target folder** in the header to choose where the assistant works. This does not move your library or installations.
- Keep one DotCode server running per machine. Logs may contain local paths and command output.

## Configuration

Set environment variables when starting the server. See `.env.example` for basic settings.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Bind address; use `127.0.0.1` for local-only listening. |
| `PORT` | `3000` | HTTP port. |
| `DOTCODE_HOME` | `~/codebases/dotcode-workspace` | Managed data directory. |
| `BROWSER` | Default browser | Set to `none` to skip opening the browser in development. |
| `GITHUB_TOKEN` | Unset | Optional token for higher GitHub API limits. |

**Keep DotCode local.** The commands above restrict listening to this machine. The default bind address listens on all interfaces; do not expose DotCode as an unauthenticated public service.

## Development

Built with React, TypeScript, Vite, Express, and the Codex SDK.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start development mode with file watching. |
| `npm test` | Run tests with Node's built-in test runner. |
| `npm run test:watch` | Rerun tests as files change. |
| `npm run lint` | Check TypeScript types. |
| `npm run build` | Type-check the frontend and tests, then bundle the frontend. |
| `npm start` | Serve the production build. |

`server.ts` is the server entry point. `frontend/src/` contains the UI; `tests/` contains regression tests. `instructions.md` defines the assistant's runtime policy.

Production still needs the server source and dependencies. The build does not type-check the server.
