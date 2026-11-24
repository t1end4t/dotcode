import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, stat, symlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInstaller } from './installer.mjs';
import { githubRepo } from './github.mjs';

const textFields = ['name', 'githubUrl', 'action', 'location', 'method', 'configurationNotes', 'version', 'installCommand', 'updateCommand', 'uninstallCommand', 'verificationCommand'];
const catalogFields = ['id', 'name', 'repo', 'githubUrl', 'category', 'categoryLabel', 'description', 'primaryLanguage', 'defaultInstallCommand', 'customNotes', 'customCommand'];
const catalogKey = url => url.replace(/\/$/, '').replace(/\.git$/, '').toLowerCase();
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
        (typeof item.detection.error === 'string' && item.detection.error.length <= 1000 ? item.detection.commit === null && item.detection.skillPaths?.length === 0 : /^[a-f\d]{40}$/.test(item.detection.commit)) &&
        Array.isArray(item.detection.badges) && item.detection.badges.length <= 10 && item.detection.badges.every(badge => ['Skill', 'MCP', 'Nix flake', 'npm CLI', 'AppImage', 'Unknown'].includes(badge)) &&
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
  const observed = new Map(installations.map(item => [item.githubUrl.toLowerCase().replace(/\/$/, ''), item]));
  const workspace = await realpath(path.join(directory, 'workspace'));
  for (const item of catalog) {
    if (!/^[\w-]+$/.test(item.id)) continue;
    const location = path.join(workspace, 'apps', item.id, 'profile');
    const key = item.githubUrl.toLowerCase().replace(/\/$/, '');
    const previous = observed.get(key);
    const owned = previous && (previous.location === location ||
      (/nix/i.test(previous.method) && contains(location, previous.location)));
    let manifest;
    try {
      if (!contains(workspace, await realpath(path.dirname(location)))) continue;
      manifest = JSON.parse(await readFile(path.join(location, 'manifest.json'), 'utf8'));
      if (manifest.version !== 3 || !manifest.elements || typeof manifest.elements !== 'object' || Array.isArray(manifest.elements)) continue;
    } catch (error) {
      if (error.code === 'ENOENT' && owned) observed.set(key, { ...previous, installed: false });
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
      if (owned) observed.set(key, { ...previous, installed: false });
      continue;
    }
    const lifecycle = {};
    for (const name of ['install', 'update', 'uninstall', 'verify']) {
      const script = path.join(path.dirname(location), `${name}.sh`);
      if ((await lstat(script).catch(() => null))?.isFile()) lifecycle[name === 'verify' ? 'verificationCommand' : `${name}Command`] = `bash '${script.replaceAll("'", "'\\''")}'`;
    }
    observed.set(key, {
      ...Object.fromEntries(textFields.map(field => [field, ''])), ...previous, ...lifecycle,
      name: item.name, githubUrl: item.githubUrl.replace(/\/$/, ''), installed: true,
      location, method: 'Nix profile (disk discovery)',
      version: path.basename(root).match(/^[^-]+-.+-(\d[^/]*)$/)?.[1] ?? '',
      configurationNotes: `Active profile manifest and executable checked on disk. Not a runtime health check. Lifecycle record: ${path.join(path.dirname(location), 'README.md')}`,
      verifiedAt: new Date().toISOString(),
    });
  }
  return [...observed.values()];
}
export function isLocalRequest(req) {
  const isCloud = Boolean(process.env.APP_URL || process.env.K_SERVICE);
  const ip = req.socket?.remoteAddress;
  const isLocalIp = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip) ||
    (isCloud && (ip?.startsWith('10.') || ip?.startsWith('172.') || ip?.startsWith('169.254.') || ip?.startsWith('::ffff:10.') || ip?.startsWith('::ffff:172.')));
  if (!isLocalIp) return false;
  try {
    const host = new URL(`http://${req.headers.host}`);
    const isAllowedHost = ['localhost', '127.0.0.1', '[::1]'].includes(host.hostname) ||
      (isCloud && (host.hostname.endsWith('.run.app') || (process.env.APP_URL && new URL(process.env.APP_URL).hostname === host.hostname)));
    if (!isAllowedHost) return false;
    if (req.headers.origin) {
      const origin = new URL(req.headers.origin);
      if (origin.origin !== host.origin && origin.hostname !== host.hostname) return false;
    }
    return req.headers['sec-fetch-site'] !== 'cross-site';
  } catch { return false; }
}

export function attachApi(app, {
  directory = process.env.DOTCODE_HOME || path.join(homedir(), '.dotcode'),
  fetchRelease = globalThis.fetch,
  installerOptions = {},
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
  const installer = createInstaller({ ...installerOptions, directory });
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
    await prepare();
    try {
      const state = JSON.parse(await readFile(statePath, 'utf8'));
      if (!state || !Array.isArray(state.installations) || !Array.isArray(state.runs)) throw new Error('Invalid inventory file. Restore it before continuing.');
      return { ...state, categories: state.categories ?? [] };
    } catch (error) {
      if (error.code === 'ENOENT') return { installations: [], runs: [], categories: [] };
      throw error;
    }
  };
  const save = async (state, file = statePath) => {
    await prepare();
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
    await rename(temporary, file);
  };
  app.use('/api/installer', (req, res, next) => {
    if (!isLocalRequest(req)) return res.status(403).json({ error: 'Local, same-origin requests only.' });
    if (req.method !== 'GET' && !req.is('application/json')) return res.status(415).json({ error: 'JSON required.' });
    if (busy || initializingCatalog) return res.status(409).json({ error: 'Another task is running. Wait for it to finish.', code: 'BUSY' });
    res.setHeader('cache-control', 'no-store');
    next();
  });

  const installerFailure = (res, error) => res.status(['CONFLICT', 'BUSY'].includes(error.code) ? 409 : 400).json({ error: error.message, code: error.code });
  app.get('/api/installer', async (_req, res) => {
    try { res.json(await installer.snapshot()); }
    catch (error) { installerFailure(res, error); }
  });
  // ponytail: keep only the latest search batch; retain per-tab results if concurrent searches become common.
  let searchCards = [];
  app.get('/api/installer/search', async (req, res) => {
    try {
      const result = await installer.search(req.query.q);
      searchCards = result.results;
      res.json(result);
    }
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
      const state = await load();
      res.json({ ...state, installations: await discoverInstallations(directory, state.installations) });
    }
    catch (error) { res.status(500).json({ error: error.message }); }
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
      const key = url => url.replace(/\/$/, '').replace(/\.git$/, '').toLowerCase();
      if (![...catalog, ...state.installations].some(item => key(item.githubUrl) === key(githubUrl))) {
        return res.status(404).json({ error: 'Repository is not in the catalog or inventory.' });
      }
      const repo = new URL(key(githubUrl)).pathname.slice(1);
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
    if (!isLocalRequest(req)) return res.status(403).json({ error: 'Local, same-origin requests only.' });
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON required.' });
    if (busy || initializingCatalog) return res.status(409).json({ error: 'Another task is running. Wait for it to finish.', code: 'BUSY' });
    res.setHeader('cache-control', 'no-store');
    busy = true;
    try {
      const repo = githubRepo(req.body?.githubUrl);
      const items = await loadCatalog() ?? [];
      const existing = items.find(item => githubRepo(item.githubUrl) === repo);
      if (existing) return res.json({ item: existing });
      const candidate = searchCards.find(card => card.repo === repo) ?? await installer.inspect(`https://github.com/${repo}`);
      const redirected = items.find(item => catalogKey(item.githubUrl) === catalogKey(candidate.githubUrl));
      if (redirected) return res.json({ item: redirected });
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
