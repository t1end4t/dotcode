import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, stat, symlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import express from 'express';
import { createInstaller, InstallerError } from './installer.mjs';
import { githubKey as catalogKey, githubRepo } from './github.mjs';
import { attachMcp, mcpToken, newBearer } from './mcp.mjs';
import { answerChat } from './chat.mjs';

const textFields = ['name', 'githubUrl', 'action', 'location', 'method', 'configurationNotes', 'version'];
const catalogFields = ['id', 'name', 'repo', 'githubUrl', 'category', 'categoryLabel', 'description', 'primaryLanguage', 'defaultInstallCommand', 'customNotes', 'customCommand'];
function validateCatalog(items) {
  if (!Array.isArray(items) || items.length > 200 || !items.every(item => item &&
      catalogFields.every(field => typeof item[field] === 'string' && item[field].length <= 16000) && item.id.trim() && item.name.trim() &&
      item.category.trim() && item.category.length <= 80 && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(item.githubUrl) &&
      Array.isArray(item.tags) && item.tags.length <= 50 && item.tags.every(tag => typeof tag === 'string' && tag.length <= 100) &&
      (item.kind === undefined || ['cli', 'desktop-app', 'skill', 'mcp'].includes(item.kind)) &&
      (item.iconUrl === undefined || typeof item.iconUrl === 'string' && item.iconUrl.length <= 2048 && /^https:\/\/(?:avatars|raw)\.githubusercontent\.com\//.test(item.iconUrl)) &&
      (item.stars === undefined || Number.isSafeInteger(item.stars) && item.stars >= 0) &&
      (item.latestReleaseAt == null || typeof item.latestReleaseAt === 'string' && Number.isFinite(Date.parse(item.latestReleaseAt))) &&
      (item.detection === undefined || item.detection &&
        typeof item.detection.checkedAt === 'string' && Number.isFinite(Date.parse(item.detection.checkedAt)) &&
        (item.detection.error === undefined || typeof item.detection.error === 'string' && item.detection.error.length > 0 && item.detection.error.length <= 1000) &&
        (/^[a-f\d]{40}$/.test(item.detection.commit) || item.detection.commit === null && item.detection.error && item.detection.skillPaths?.length === 0) &&
        Array.isArray(item.detection.badges) && item.detection.badges.length <= 10 && item.detection.badges.every(badge => ['Skill', 'MCP', 'Nix flake', 'npm CLI', 'AppImage', 'Hook', 'Library', 'Unknown'].includes(badge)) &&
        Array.isArray(item.detection.skillPaths) && item.detection.skillPaths.length <= 10000 && item.detection.skillPaths.every(value => typeof value === 'string' && value.length <= 1000 && !value.includes('\\') && !value.startsWith('/') && !value.split('/').some(part => ['.', '..'].includes(part)))) ) ||
      new Set(items.map(item => item.id)).size !== items.length ||
      new Set(items.map(item => catalogKey(item.githubUrl))).size !== items.length) throw new Error('Invalid catalog. File unchanged.');
  return items.map(item => ({ ...Object.fromEntries([...catalogFields, 'stars', 'latestReleaseAt', 'kind', 'iconUrl'].filter(field => item[field] !== undefined).map(field => [field, item[field]])), tags: item.tags,
    ...(item.detection && { detection: { checkedAt: item.detection.checkedAt, commit: item.detection.commit, badges: item.detection.badges, skillPaths: item.detection.skillPaths, ...(item.detection.error && { error: item.detection.error }) } }),
  }));
}

function contains(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function canonicalPath(target) {
  try { return await realpath(target); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const info = await lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (info?.isSymbolicLink()) throw new Error('Desktop path contains a dangling symlink.');
    return path.join(await canonicalPath(path.dirname(target)), path.basename(target));
  }
}

// ponytail: catalog-matched Nix v3 profiles only; add adapters when other installation methods need discovery.
async function discoverInstallations(directory, installations) {
  let catalog;
  try { catalog = validateCatalog(JSON.parse(await readFile(path.join(directory, 'catalog.json'), 'utf8'))); }
  catch { return installations; }
  const observed = [...installations];
  const workspace = await realpath(path.join(directory, 'workspace')).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!workspace || workspace === directory || !contains(directory, workspace)) return installations;
  for (const item of catalog) {
    if (!/^[\w-]+$/.test(item.id)) continue;
    const location = path.join(workspace, 'apps', item.id, 'profile');
    const key = catalogKey(item.githubUrl);
    const previousIndex = observed.findIndex(record => typeof record?.githubUrl === 'string' && catalogKey(record.githubUrl) === key &&
      typeof record.location === 'string' && (record.location === location || (/nix/i.test(record.method) && contains(location, record.location))));
    const previous = observed[previousIndex];
    let manifest;
    try {
      if (!contains(workspace, await realpath(path.dirname(location)))) continue;
      manifest = JSON.parse(await readFile(path.join(location, 'manifest.json'), 'utf8'));
      if (manifest.version !== 3 || !manifest.elements || typeof manifest.elements !== 'object' || Array.isArray(manifest.elements)) continue;
    } catch (error) {
      if (error.code === 'ENOENT' && previous) observed[previousIndex] = { ...previous, installed: false };
      continue;
    }
    const storePaths = Object.values(manifest.elements).filter(entry => entry?.active === true && Array.isArray(entry.storePaths))
      .flatMap(entry => entry.storePaths).filter(target => typeof target === 'string' && path.isAbsolute(target));
    let root;
    const binaries = await readdir(path.join(location, 'bin')).catch(() => []);
    for (const name of binaries) {
      try {
        const target = await realpath(path.join(location, 'bin', name));
        const info = await stat(target);
        if (!info.isFile() || !(info.mode & 0o111)) continue;
        for (const storePath of storePaths) {
          if (await realpath(path.join(storePath, 'bin', name)).catch(() => null) === target) {
            root = storePath;
            break;
          }
        }
        if (root) break;
      } catch {}
    }
    if (!root) {
      if (previous) observed[previousIndex] = { ...previous, installed: false };
      continue;
    }
    const discovered = {
      ...Object.fromEntries(textFields.map(field => [field, ''])), ...previous,
      name: item.name, githubUrl: item.githubUrl.replace(/\/$/, ''), installed: true,
      location, method: 'Nix profile (disk discovery)',
      version: path.basename(root).match(/^[^-]+-.+-(\d[^/]*)$/)?.[1] ?? '',
      configurationNotes: `Active profile manifest and executable checked on disk. Not a runtime health check. Unmanaged: no Receipt, display only.`,
      verifiedAt: new Date().toISOString(),
    };
    if (previous) observed[previousIndex] = discovered;
    else observed.push(discovered);
  }
  return observed;
}
function loopbackAddress(address) {
  const ip = address?.replace(/^::ffff:/, '');
  return ip === '::1' || ip?.startsWith('127.') ? ip : undefined;
}

function isLocalRequest(req) {
  if (!loopbackAddress(req.socket.remoteAddress)) return false;
  const { host, origin, 'sec-fetch-site': fetchSite } = req.headers;
  if (req.headersDistinct.host?.length !== 1 || !/^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d{1,5})?$/i.test(host)) return false;
  try {
    const expectedOrigin = new URL(`http://${host}`).origin;
    return fetchSite !== 'cross-site' && (origin === undefined || origin === expectedOrigin);
  } catch { return false; }
}

export function attachApi(app, {
  directory = process.env.DOTCODE_HOME || path.join(homedir(), '.dotcode'),
  fetchRelease = globalThis.fetch,
  installerOptions = {},
  createCodex = undefined,
} = {}) {
  directory = path.resolve(directory);
  const appDirectory = fileURLToPath(new URL('..', import.meta.url));
  const protectedDirectories = [appDirectory, path.join(homedir(), 'nix-dev', 'nixos-conf')];
  const checkDirectory = target => {
    if (protectedDirectories.some(protectedPath => contains(protectedPath, target) || contains(target, protectedPath))) {
      throw new Error('DOTCODE_HOME must be separate from the DotCode source and NixOS configuration.');
    }
  };
  checkDirectory(directory);
  let busy = false;
  let initializingCatalog = false;
  const statePath = path.join(directory, 'inventory.json');
  const catalogPath = path.join(directory, 'catalog.json');
  const loadCatalog = async () => {
    try { return validateCatalog(JSON.parse(await readFile(catalogPath, 'utf8'))); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  };
  const workspace = path.join(directory, 'workspace');
  const prepare = async () => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    checkDirectory(await realpath(directory));
    await mkdir(workspace, { recursive: true, mode: 0o700 });
    const root = await realpath(directory);
    const target = await realpath(workspace);
    if (root === target || !contains(root, target)) throw new Error('Managed workspace must stay inside DOTCODE_HOME.');
    checkDirectory(await realpath(workspace));
  };
  const load = async () => {
    try {
      checkDirectory(await realpath(directory));
      const state = JSON.parse(await readFile(statePath, 'utf8'));
      if (!state || !Array.isArray(state.installations) || !Array.isArray(state.runs)) throw new Error('Invalid inventory file. Restore it before continuing.');
      return { ...state, categories: state.categories ?? [] };
    } catch (error) {
      if (error.code === 'ENOENT') return { installations: [], runs: [], categories: [] };
      throw error;
    }
  };
  const loadInstallations = async () => {
    const state = await load();
    // Old lifecycle scripts are never offered: installs without a Receipt are display-only.
    const installations = (await discoverInstallations(directory, state.installations)).map(({ installCommand, updateCommand, uninstallCommand, verificationCommand, ...item }) => item);
    return { ...state, installations };
  };
  const installer = createInstaller({ ...installerOptions, directory, loadInstallations: async () => (await loadInstallations()).installations });
  const save = async (state, file = statePath) => {
    await prepare();
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
    await rename(temporary, file);
  };
  const token = prepare().then(() => mcpToken(path.join(directory, 'mcp-token')));
  token.catch(error => console.error(`DotCode MCP disabled: ${error.message}`));
  const githubUrlSchema = { type: 'string', description: 'GitHub repository URL, e.g. https://github.com/owner/repo' };
  const whenIdle = call => args => {
    if (busy || initializingCatalog) throw new Error('Another task is running. Wait for it to finish.');
    return call(args);
  };
  // Holds the busy lock like POST /api/installer/detect so UI tasks and other MCP calls wait.
  const exclusive = call => whenIdle(async args => {
    busy = true;
    try { return await call(args); }
    finally { busy = false; }
  });
  // Opt in by name on both sides of MCP so the Assistant bearer cannot reach other tools.
  const assistant = { token: newBearer(), tools: ['search', 'repo_info', 'detect', 'list_components'] };
  attachMcp(app, { isLocal: isLocalRequest, token, assistant, tools: [
    { name: 'search', description: 'Search GitHub repositories (or inspect one URL / owner/repo) with Detector badges, like DotCode Search.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      call: ({ query }) => installer.search(query) },
    { name: 'repo_info', description: 'Read GitHub metadata and README for a repository, plus its Library Card if the user added one.',
      inputSchema: { type: 'object', properties: { githubUrl: githubUrlSchema }, required: ['githubUrl'] },
      call: async ({ githubUrl }) => {
        const info = await installer.info(githubUrl);
        const card = (await loadCatalog() ?? []).find(card => catalogKey(card.githubUrl) === catalogKey(githubUrl)) ?? null;
        return { ...info, card };
      } },
    { name: 'detect', description: 'Run the Detector on a repository and return ranked candidate Recipes. Does not install anything.',
      inputSchema: { type: 'object', properties: { githubUrl: githubUrlSchema, ref: { type: 'string' } }, required: ['githubUrl'] },
      call: exclusive(({ githubUrl, ref }) => installer.detect({ githubUrl, ref })) },
    { name: 'list_components', description: 'List installed Components from their Receipts with current Activation status.',
      inputSchema: { type: 'object', properties: {} },
      call: whenIdle(() => installer.snapshot()) },
    { name: 'list_unmanaged', description: 'List Unmanaged CLIs, skills, subagents, plugins, user units and older apps with name and port conflict warnings. Display only.',
      inputSchema: { type: 'object', properties: {} },
      call: whenIdle(() => installer.unmanaged()) },
  ] });
  app.use('/api', (req, res, next) => {
    if (!isLocalRequest(req)) return res.status(403).json({ error: 'Local, same-origin requests only.' });
    if (req.method !== 'GET' && !req.is('application/json')) return res.status(415).json({ error: 'JSON required.' });
    next();
  });
  let chatRunning = false;
  app.post('/api/ai/chat', express.json({ limit: '128kb' }), async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    const { message, githubUrl, history = [] } = req.body ?? {};
    if (typeof message !== 'string' || !message.trim() || message.length > 4000 || !Array.isArray(history) || history.length > 8 ||
        history.some(entry => !['user', 'assistant'].includes(entry?.role) || typeof entry.text !== 'string' || entry.text.length > 4000)) {
      return res.status(400).json({ error: 'Enter a message of up to 4,000 characters.' });
    }
    let repo;
    if (githubUrl != null) {
      try { repo = `https://github.com/${githubRepo(githubUrl)}`; }
      catch (error) { return res.status(400).json({ error: error.message }); }
    }
    // Use the accepted socket's loopback address, never a client-supplied Host.
    const ip = loopbackAddress(req.socket.localAddress);
    if (!ip) return res.status(403).json({ error: 'The Assistant requires a loopback connection.' });
    const host = ip === '::1' ? '[::1]' : ip;
    if (chatRunning) return res.status(409).json({ error: 'The Assistant is answering another question. Try again shortly.' });
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]);
    res.once('close', () => controller.abort());
    chatRunning = true;
    try {
      const reply = await answerChat({ message: message.trim(), githubUrl: repo, history: history.map(({ role, text }) => ({ role, text })),
        mcpUrl: `http://${host}:${req.socket.localPort}/mcp`, token: assistant.token, tools: assistant.tools, signal, createCodex });
      if (!res.destroyed) res.json({ reply });
    } catch (error) {
      // SDK errors can contain raw provider responses, URLs or credentials.
      const auth = /\b(?:401|unauthorized|authentication|not logged in|api key)\b/i.test(error.message);
      if (!res.destroyed) res.status(signal.aborted ? 504 : 502).json({ error: signal.aborted
        ? 'Codex took too long to answer. Try again.' : auth
          ? 'Codex sign-in failed. Check OPENAI_API_KEY or sign in with the default file-backed Codex credential store.'
          : 'Could not reach Codex or DotCode MCP. Check the connection and try again.' });
    } finally { chatRunning = false; }
  });
  app.use('/api/ai/chat', (error, _req, res, _next) => res.status(error.type === 'entity.too.large' ? 413 : 400)
    .json({ error: error.type === 'entity.too.large' ? 'Chat request is too large.' : 'Invalid chat request.' }));
  app.use('/api', express.json({ limit: '512kb' }));
  const installerFailure = (res, error) => res.status(['CONFLICT', 'BUSY'].includes(error.code) ? 409 : 400).json({ error: error.message, code: error.code });
  // ponytail: keep only the latest search batch; superseded refreshes require a new Search.
  let searchCards = [];
  let searchGeneration = 0;
  app.get('/api/installer/search', async (req, res) => {
    const generation = ++searchGeneration;
    res.setHeader('cache-control', 'no-store');
    try {
      const result = await installer.search(req.query.q);
      if (res.destroyed) return;
      if (generation === searchGeneration) searchCards = result.results;
      res.json(result);
    }
    catch (error) { if (!res.destroyed) installerFailure(res, error); }
  });
  app.use('/api/installer', (_req, res, next) => {
    if (busy || initializingCatalog) return res.status(409).json({ error: 'Another task is running. Wait for it to finish.', code: 'BUSY' });
    res.setHeader('cache-control', 'no-store');
    next();
  });
  app.get('/api/installer', async (_req, res) => {
    try { res.json(await installer.snapshot()); }
    catch (error) { installerFailure(res, error); }
  });
  app.get('/api/installer/unmanaged', async (_req, res) => {
    try { res.json(await installer.unmanaged()); }
    catch (error) { installerFailure(res, error); }
  });
  app.post('/api/installer/detect', async (req, res) => {
    busy = true;
    try { res.json(await installer.detect(req.body)); }
    catch (error) { installerFailure(res, error); }
    finally { busy = false; }
  });
  app.post('/api/installer/plan', async (req, res) => {
    busy = true;
    try {
      let body = req.body;
      let detection;
      if (req.body?.action === 'install') {
        const cards = await loadCatalog() ?? [];
        const card = cards.find(card => typeof req.body.githubUrl === 'string' && catalogKey(card.githubUrl) === catalogKey(req.body.githubUrl));
        if (!card) throw new Error('Choose a Card from the Library.');
        if (card.detection) {
          const refreshed = await installer.refreshDetection(card);
          if (refreshed !== card) await save(validateCatalog(cards.map(entry => entry === card ? refreshed : entry)), catalogPath);
          detection = refreshed.detection;
          if (body.recipe?.backend !== 'nix' && body.subpath === undefined && (body.ref ?? 'HEAD') === 'HEAD' && detection.skillPaths.length === 1) {
            body = { ...body, subpath: detection.skillPaths[0] };
          }
        }
      }
      res.json(await installer.plan(body, detection));
    } catch (error) { installerFailure(res, error); }
    finally { busy = false; }
  });
  app.post('/api/installer/execute', async (req, res) => {
    if (typeof req.body?.planId !== 'string') return res.status(400).json({ error: 'A plan ID is required.' });
    busy = true;
    try { res.json(await installer.execute(req.body.planId)); }
    catch (error) { installerFailure(res, error); }
    finally { busy = false; }
  });

  app.get('/api/inventory', async (_req, res) => {
    try {
      const state = await loadInstallations();
      res.json({ ...state, installations: await installer.inventory(state.installations) });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.get('/api/updates', async (req, res) => {
    const githubUrl = req.query.githubUrl;
    if (typeof githubUrl !== 'string' || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(githubUrl)) {
      return res.status(400).json({ error: 'A valid GitHub repository URL is required.' });
    }
    try {
      const state = await load();
      let catalog = [];
      try { catalog = validateCatalog(JSON.parse(await readFile(catalogPath, 'utf8'))); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const key = catalogKey(githubUrl);
      if (![...catalog, ...state.installations].some(item => typeof item?.githubUrl === 'string' && catalogKey(item.githubUrl) === key)) {
        return res.status(404).json({ error: 'Repository is not in the catalog or inventory.' });
      }
      const repo = new URL(key).pathname.slice(1);
      const response = await fetchRelease(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'DotCode' },
        redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      if (response.status === 404) return res.json({ githubUrl, checkedAt: new Date().toISOString(), error: 'No public stable release found.' });
      if (!response.ok) throw new Error(response.status === 403 || response.status === 429
        ? 'GitHub rate limit or access restriction. Try again later.' : `GitHub release check failed (HTTP ${response.status}).`);
      const release = await response.json();
      if (typeof release.tag_name !== 'string' || !release.tag_name.trim() || release.tag_name.length > 200 || release.draft || release.prerelease) {
        throw new Error('GitHub returned an invalid stable release.');
      }
      res.setHeader('cache-control', 'no-store');
      res.json({ githubUrl, latestVersion: release.tag_name, releaseNotes: typeof release.body === 'string' ? release.body.slice(0, 16000) : '', checkedAt: new Date().toISOString() });
    } catch (error) { res.status(502).json({ error: error.message }); }
  });

  app.get('/api/catalog', async (_req, res) => {
    try { await prepare(); res.json({ items: validateCatalog(JSON.parse(await readFile(catalogPath, 'utf8'))) }); }
    catch (error) { error.code === 'ENOENT' ? res.json({ items: null }) : res.status(500).json({ error: `Invalid catalog file: ${error.message}` }); }
  });

  app.post('/api/catalog/cards', async (req, res) => {
    if (busy || initializingCatalog) return res.status(409).json({ error: 'Another task is running. Wait for it to finish.', code: 'BUSY' });
    res.setHeader('cache-control', 'no-store');
    busy = true;
    try {
      const repo = githubRepo(req.body?.githubUrl);
      const refresh = req.body.refreshDetection;
      if (refresh !== undefined && (!refresh || typeof refresh !== 'object' || Array.isArray(refresh) || refresh.error)) {
        throw new Error('Invalid detection refresh request.');
      }
      const items = await loadCatalog() ?? [];
      const existing = items.find(item => githubRepo(item.githubUrl) === repo);
      const found = searchCards.find(card => card.repo === repo);
      if (refresh) {
        if (!existing) return res.status(404).json({ error: 'Choose a Card from the Library.', code: 'NOT_FOUND' });
        if (isDeepStrictEqual(existing.detection, refresh)) return res.json({ item: existing });
        const detection = found?.detection;
        if (!isDeepStrictEqual(detection, refresh) || Date.parse(existing.detection?.checkedAt) > Date.parse(detection.checkedAt)) {
          return res.status(409).json({ error: 'This detection result is out of date. Search again before refreshing the Card.', code: 'CONFLICT' });
        }
        const updated = validateCatalog(items.map(item => item === existing ? { ...item, detection } : item));
        await save(updated, catalogPath);
        return res.json({ item: updated.find(item => item.id === existing.id) });
      }
      if (existing) return res.json({ item: existing });
      const candidate = found ?? await installer.inspect(`https://github.com/${repo}`);
      const saved = items.find(item => catalogKey(item.githubUrl) === catalogKey(candidate.githubUrl));
      if (saved) return res.json({ item: saved });
      const updated = validateCatalog([...items, candidate]);
      await save(updated, catalogPath);
      res.status(201).json({ item: updated.at(-1) });
    } catch (error) { installerFailure(res, error); }
    finally { busy = false; }
  });

  app.put('/api/catalog', async (req, res) => {
    let items;
    try { items = validateCatalog(req.body?.items); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    if (busy || initializingCatalog) return res.status(409).json({ error: 'Another task is running. Retry after it finishes.' });
    initializingCatalog = true;
    try {
      if (await loadCatalog() !== null) return res.status(409).json({ error: 'Catalog already initialized. Use chat to change cards.' });
      await save(items, catalogPath); res.json({ ok: true });
    }
    catch (error) { res.status(500).json({ error: error.message }); }
    finally { initializingCatalog = false; }
  });
  return async () => {};
}
