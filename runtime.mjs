import { execFile, spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, copyFile, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { freemem, homedir, totalmem, userInfo } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const TTL = 15 * 60 * 1000;
const slug = value => {
  if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 64) throw new Error('Use a lowercase name with letters, numbers and hyphens.');
  return value;
};
const text = (value, limit = 32000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || value.includes('\0')) throw new Error('Missing or invalid text.');
  return value.trim();
};
const fileName = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._+()-]*\.gguf$/i.test(value) || value.length > 240) throw new Error('Invalid GGUF filename.');
  return value;
};
const integer = (value, min, max) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Expected an integer from ${min} to ${max}.`);
  return value;
};
const argsList = value => {
  if (!Array.isArray(value) || value.length > 100 || !value.every(arg => typeof arg === 'string' && arg.length <= 4096 && !/[\0\r\n]/.test(arg))) throw new Error('Invalid argument list. Use one argument per line.');
  return value;
};
const digest = value => createHash('sha256').update(value ?? '').digest('hex');
const contains = (root, target) => target === root || target.startsWith(root + path.sep);
const quoteUnit = value => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%').replaceAll('$', '$$') + '"';
const readOptional = async file => {
  try { return await readFile(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};

function endpointURL(value) {
  const url = new URL(text(value, 2000));
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || !['', '/', '/v1', '/v1/'].includes(url.pathname)) throw new Error('Use an HTTP loopback IP endpoint, optionally ending in /v1. No credentials or redirects.');
  return `${url.origin}/v1`;
}

function agentEntry(body) {
  const agent = body.agent;
  if (!['codex', 'claude'].includes(agent)) throw new Error('Choose Codex or Claude Code.');
  const category = body.category;
  if (!['skill', 'mcp', 'instruction'].includes(category)) throw new Error('Invalid agent category.');
  const name = slug(body.name);
  const entry = { agent, category, name, id: `${agent}:${category}:${name}`, enabled: body.enabled !== false };
  if (category !== 'mcp') return { ...entry, description: text(body.description, 500), content: text(body.content) };
  if (body.transport === 'http') {
    const url = new URL(text(body.url, 2000));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Invalid MCP URL. Keep credentials outside the dashboard.');
    return { ...entry, transport: 'http', url: url.href };
  }
  if (body.transport !== 'stdio') throw new Error('Choose HTTP or stdio transport.');
  return { ...entry, transport: 'stdio', command: text(body.command, 4096), args: argsList(body.args ?? []) };
}

export function createRuntime({ directory, home = homedir(), run = promisify(execFile), spawnProcess = spawn, fetchRemote = globalThis.fetch, now = Date.now } = {}) {
  directory = path.resolve(directory ?? process.env.DOTCODE_HOME ?? path.join(home, 'codebases/dotcode-workspace'));
  const protectedRoots = [fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, ''), path.join(home, 'nix-dev/nixos-conf')];
  if (directory === home || directory === path.parse(directory).root || protectedRoots.some(root => contains(root, directory) || contains(directory, root))) throw new Error('Runtime data must be separate from application source, home and NixOS configuration.');
  const pending = new Map();
  const processes = new Map();
  const downloads = new Map();
  const jobs = new Set();
  let executing = false;
  let closed = false;
  const systemEnv = { ...process.env, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${userInfo().uid}` };
  const command = (program, args) => run(program, args, { env: systemEnv, timeout: 15000, maxBuffer: 256 * 1024 });

  async function managed(relative) {
    const target = path.resolve(directory, relative);
    if (!contains(directory, target)) throw new Error('Path must stay inside DOTCODE_HOME.');
    let cursor = path.parse(target).root;
    for (const part of target.slice(cursor.length).split(path.sep)) {
      cursor = path.join(cursor, part);
      try {
        const info = await lstat(cursor);
        if (info.isSymbolicLink()) throw new Error(`Managed paths cannot contain a symlink: ${cursor}`);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return target;
  }

  async function atomic(relative, content, backup = false) {
    const target = await managed(relative);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    if (backup) {
      const previous = await readOptional(target);
      if (previous !== null) await atomic(`runtime/backups/${now()}-${randomUUID()}-${path.basename(target)}`, previous);
    }
    const temporary = await managed(`${relative}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
      await managed(relative);
      await rename(temporary, target);
      if (await readFile(target, 'utf8') !== content) throw new Error('Written file failed verification.');
    } finally { await rm(temporary, { force: true }); }
  }

  async function state() {
    const raw = await readOptional(await managed('runtime/state.json'));
    const saved = raw === null ? {} : JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid runtime state. Restore a backup.');
    const services = [];
    for (const [id, name, port] of [['9router', '9Router', 20128], ['headroom', 'Headroom', 8787]]) {
      const legacy = `thinking-os-srv-${id}.service`;
      const legacyExists = await lstat(path.join(home, '.config/systemd/user', legacy)).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
      const stored = (saved.services ?? []).find(service => service.id === id);
      const unit = stored?.unit ?? (legacyExists ? legacy : `dotcode-${id}.service`);
      if (![legacy, `dotcode-${id}.service`].includes(unit)) throw new Error('Invalid stored service unit.');
      services.push({ id, name, port, unit, external: unit === legacy, adopted: stored?.adopted === true, description: id === 'headroom' ? 'Code-aware proxy. Legacy data and workspace mounts remain unchanged.' : 'Local API router. Existing credentials and configuration remain unchanged.' });
    }
    for (const service of saved.services ?? []) {
      if (services.some(item => item.id === service.id)) continue;
      slug(service.id);
      if (service.unit !== `dotcode-${service.id}.service` || service.external) throw new Error('Invalid stored service.');
      services.push({ ...service, name: text(service.name, 100), port: integer(service.port, 1024, 65535) });
    }
    const agents = (saved.agents ?? []).map(agentEntry);
    const backend = saved.backend ?? 'llama.cpp';
    if (!['llama.cpp', 'external'].includes(backend)) throw new Error('Invalid stored model backend.');
    return { raw, value: { services, agents, backend, endpoint: backend === 'external' ? endpointURL(saved.endpoint) : '', history: (saved.history ?? []).slice(-50) } };
  }

  async function serviceStatus(service) {
    try {
      const { stdout } = await command('systemctl', ['--user', 'show', service.unit, '--property=LoadState,ActiveState,SubState,UnitFileState,MainPID']);
      const props = Object.fromEntries(stdout.trim().split('\n').map(line => line.split('=')));
      return { ...service, installed: props.LoadState === 'loaded', running: props.ActiveState === 'active', status: props.ActiveState || 'unknown', autostart: ['enabled', 'enabled-runtime'].includes(props.UnitFileState), pid: Number(props.MainPID) || null };
    } catch (error) { return { ...service, installed: false, running: false, status: 'unknown', autostart: false, error: error.message }; }
  }

  async function modelFiles(root, external = false) {
    try {
      if ((await lstat(root)).isSymbolicLink()) throw new Error('Model directory cannot be a symlink.');
      const entries = await readdir(root, { withFileTypes: true });
      return await Promise.all(entries.filter(entry => entry.isFile() && /^[A-Za-z0-9][A-Za-z0-9._+()-]*\.gguf$/i.test(entry.name)).map(async entry => {
        const info = await lstat(path.join(root, entry.name));
        const runtime = processes.get(entry.name);
        if (runtime?.status === 'starting' || runtime?.status === 'running') {
          try {
            const response = await fetchRemote(`http://127.0.0.1:${runtime.port}/health`, { redirect: 'error', signal: AbortSignal.timeout(800) });
            if (['starting', 'running'].includes(runtime.status)) runtime.status = response.ok ? 'running' : 'starting';
          } catch { if (runtime.status === 'running') runtime.status = 'starting'; }
        }
        return { fileName: entry.name, sizeBytes: info.size, external, projector: /^mmproj/i.test(entry.name), status: runtime?.status ?? 'ready', port: runtime?.port, error: runtime?.error, logs: runtime?.logs ?? [] };
      }));
    } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }

  async function installedSkills() {
    const result = [];
    for (const [agent, relative] of [['codex', '.agents/skills'], ['codex', '.codex/skills'], ['claude', '.claude/skills']]) {
      const root = path.join(home, relative);
      let entries;
      try { entries = await readdir(root, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      for (const entry of entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).slice(0, 200)) {
        const file = path.join(root, entry.name, 'SKILL.md');
        const info = await lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
        if (!info?.isFile() || info.size > 64000) continue;
        const content = await readFile(file, 'utf8');
        result.push({ agent, name: entry.name, description: content.match(/^description:\s*(.+)$/m)?.[1]?.slice(0, 300) ?? 'Existing user skill', path: file });
      }
    }
    return result;
  }

  async function snapshot() {
    const { value } = await state();
    const models = await modelFiles(await managed('models'));
    const importableModels = (await modelFiles(path.join(home, 'LOCAL-AI-MODELS'), true)).filter(model => !models.some(owned => owned.fileName === model.fileName));
    const external = { models: [], error: null };
    if (value.backend === 'external') {
      try {
        const response = await fetchRemote(`${value.endpoint}/models`, { redirect: 'error', signal: AbortSignal.timeout(2000) });
        if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}.`);
        const body = await response.json();
        if (!Array.isArray(body.data) || !body.data.every(model => typeof model.id === 'string')) throw new Error('Backend did not return a model list.');
        external.models = body.data.slice(0, 200).map(model => model.id);
      } catch (error) { external.error = error.message; }
    }
    return { directory, workspace: path.join(directory, 'workspace'), ...value, services: await Promise.all(value.services.map(serviceStatus)), models, importableModels, installedSkills: await installedSkills(), downloads: [...downloads.values()].map(({ controller, task, ...download }) => download), hardware: { ramTotalBytes: totalmem(), ramFreeBytes: freemem() }, external };
  }

  async function agentFiles(entries, entry) {
    if (entry.category === 'skill') {
      const relative = `workspace/${entry.agent === 'codex' ? '.agents' : '.claude'}/skills/${entry.name}/SKILL.md`;
      const previous = await readOptional(await managed(relative));
      const known = entries.some(item => item.id === entry.id);
      if (previous !== null && !known) throw new Error('That skill already exists outside DotCode. Choose another name.');
      if (!entry.enabled) return [{ relative, content: null, previous }];
      return [{ relative, previous, content: `---\nname: ${entry.name}\ndescription: ${JSON.stringify(entry.description)}\n---\n\n${entry.content}\n` }];
    }
    const all = [...entries.filter(item => item.id !== entry.id), entry].filter(item => item.agent === entry.agent && item.category === entry.category);
    const enabled = all.filter(item => item.enabled);
    if (entry.category === 'instruction') {
      const relative = `workspace/${entry.agent === 'codex' ? 'AGENTS.md' : 'CLAUDE.md'}`;
      const previous = await readOptional(await managed(relative));
      const begin = '<!-- dotcode:instructions -->';
      const end = '<!-- /dotcode:instructions -->';
      const content = enabled.map(item => `## ${item.description}\n\n${item.content}`).join('\n\n');
      return [{ relative, previous, content: mergeBlock(previous ?? '', begin, end, content) }];
    }
    if (entry.agent === 'codex') {
      const relative = 'workspace/.codex/config.toml';
      const previous = await readOptional(await managed(relative));
      const begin = '# dotcode:mcp';
      const end = '# /dotcode:mcp';
      const without = mergeBlock(previous ?? '', begin, end, '');
      if (/^\s*\[.*mcp_servers/m.test(without) || /^\s*mcp_servers\s*=/m.test(without)) throw new Error('Existing unmanaged MCP configuration found. Merge it manually before using these controls.');
      const content = enabled.map(item => `[mcp_servers.${item.name}]\n` + (item.transport === 'http' ? `url = ${JSON.stringify(item.url)}\n` : `command = ${JSON.stringify(item.command)}\nargs = ${JSON.stringify(item.args)}\n`)).join('\n');
      return [{ relative, previous, content: mergeBlock(previous ?? '', begin, end, content) }];
    }
    const relative = 'workspace/.mcp.json';
    const previous = await readOptional(await managed(relative));
    const parsed = previous === null ? { mcpServers: {} } : JSON.parse(previous);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed.mcpServers || typeof parsed.mcpServers !== 'object' || Array.isArray(parsed.mcpServers)) throw new Error('Invalid existing MCP configuration.');
    const servers = { ...parsed.mcpServers };
    for (const item of all) {
      if (Object.hasOwn(servers, item.name) && !entries.some(known => known.id === item.id)) throw new Error('That MCP server already exists outside DotCode.');
      delete servers[item.name];
    }
    for (const item of enabled) servers[item.name] = item.transport === 'http' ? { type: 'http', url: item.url } : { type: 'stdio', command: item.command, args: item.args };
    return [{ relative, previous, content: JSON.stringify({ ...parsed, mcpServers: servers }, null, 2) + '\n' }];
  }

  function mergeBlock(previous, begin, end, content) {
    const starts = previous.split(begin);
    const ends = previous.split(end);
    if (starts.length !== ends.length || starts.length > 2 || (starts.length === 2 && previous.indexOf(end) < previous.indexOf(begin))) throw new Error('Invalid managed configuration markers. File unchanged.');
    const clean = starts.length === 2 ? starts[0] + starts[1].slice(starts[1].indexOf(end) + end.length) : previous;
    return clean.trimEnd() + (content ? `\n\n${begin}\n${content}\n${end}\n` : '\n');
  }

  async function regularModel(relative, external = false) {
    const target = external ? path.join(home, 'LOCAL-AI-MODELS', fileName(relative)) : await managed(`models/${fileName(relative)}`);
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Expected a regular model file, not a symlink.');
    if (external && (await lstat(path.dirname(target))).isSymbolicLink()) throw new Error('Model directory cannot be a symlink.');
    return { target, info };
  }

  async function plan(body) {
    if (closed) throw new Error('Runtime is shutting down.');
    const { raw, value } = await state();
    const files = [];
    let request;
    let title;
    let details = [];
    if (body?.kind === 'service') {
      const service = value.services.find(item => item.id === body.id);
      if (!service || !['adopt', 'start', 'stop', 'restart', 'enable', 'disable'].includes(body.action)) throw new Error('Unknown service or action.');
      if (body.action === 'adopt' && !service.external) throw new Error('No legacy unit to adopt.');
      if (service.external && !service.adopted && body.action !== 'adopt') throw new Error('Take over this existing service before controlling it.');
      request = { kind: 'service', id: service.id, action: body.action };
      title = `${body.action === 'adopt' ? 'Take over' : body.action} ${service.name}`;
      details = [`Unit: ${service.unit}`, body.action === 'adopt' ? 'Save its existing unit reference in DotCode. Do not restart, reinstall or relocate it.' : `systemctl --user ${body.action === 'enable' ? 'enable --now' : body.action} ${service.unit}`, service.external ? 'Existing installation, credentials, Docker volume and workspace mounts remain external and unchanged.' : 'New unit definitions and working data stay inside DOTCODE_HOME. systemd registration links are the only exception.', body.action === 'disable' ? 'Disabling autostart does not stop the running service.' : 'Autostart means the user systemd default target, not guaranteed startup before login.'];
      if (!service.external && body.action !== 'adopt') {
        const relative = `runtime/units/${service.unit}`;
        const previous = await readOptional(await managed(relative));
        if (previous === null && ['start', 'restart', 'enable'].includes(body.action)) throw new Error('No DotCode unit exists for this service. Create one first.');
        files.push({ relative, previous, checkOnly: true });
      }
    } else if (body?.kind === 'service-create') {
      const id = slug(body.name);
      if (value.services.some(service => service.id === id)) throw new Error('A service already uses that name.');
      const program = text(body.program, 4096);
      if (/[\r\n]/.test(program)) throw new Error('Invalid executable.');
      let executable;
      for (const candidate of path.isAbsolute(program) ? [program] : (process.env.PATH ?? '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, program))) {
        try { await access(candidate, constants.X_OK); if ((await lstat(await realpath(candidate))).isFile()) { executable = await realpath(candidate); break; } } catch {}
      }
      if (!executable) throw new Error('Executable not found. Install it through Tool Library first.');
      const args = argsList(body.args ?? []);
      const port = integer(body.port, 1024, 65535);
      const unit = `dotcode-${id}.service`;
      const cwd = await managed(`services/${id}`);
      const relative = `runtime/units/${unit}`;
      const previous = await readOptional(await managed(relative));
      if (previous !== null || await lstat(path.join(home, '.config/systemd/user', unit)).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) throw new Error('Unit already exists. It will not be overwritten.');
      const content = `[Unit]\nDescription=DotCode ${id}\nAfter=network-online.target\n\n[Service]\nType=simple\nWorkingDirectory=${quoteUnit(cwd)}\nEnvironment=${quoteUnit(`HOME=${cwd}/home`)}\nEnvironment=${quoteUnit(`XDG_CONFIG_HOME=${cwd}/home/.config`)}\nEnvironment=${quoteUnit(`XDG_DATA_HOME=${cwd}/home/.local/share`)}\nEnvironment=${quoteUnit(`XDG_CACHE_HOME=${cwd}/home/.cache`)}\nEnvironment=${quoteUnit(`PATH=${process.env.PATH ?? ''}`)}\nExecStart=${[executable, ...args].map(quoteUnit).join(' ')}\nRestart=on-failure\nRestartSec=3\nUMask=0077\n\n[Install]\nWantedBy=default.target\n`;
      request = { kind: 'service-create', service: { id, name: id, port, unit, external: false, adopted: true }, cwd };
      files.push({ relative, previous, content });
      title = `Create ${id} service`;
      details = [`Executable: ${executable}`, `Arguments: ${JSON.stringify(args)}`, `Working folder: ${cwd}`, 'Create the unit only. Start and autostart require separate approval. This is a host process, not the assistant sandbox.'];
    } else if (body?.kind === 'backend') {
      if (!['llama.cpp', 'external'].includes(body.backend)) throw new Error('Unknown backend.');
      request = { kind: 'backend', backend: body.backend, endpoint: body.backend === 'external' ? endpointURL(body.endpoint) : '' };
      title = `Use ${body.backend === 'external' ? 'custom local endpoint' : 'llama.cpp'}`;
      details = [request.endpoint || 'Use the installed llama-server executable. No inference engine is installed.', 'Changing the selector does not stop existing models or change the Copilot provider.'];
    } else if (body?.kind === 'model') {
      const name = fileName(body.fileName);
      const action = body.action;
      if (!['start', 'stop', 'remove', 'import', 'download', 'cancel'].includes(action)) throw new Error('Unknown model action.');
      request = { kind: 'model', action, fileName: name };
      await managed(`models/${name}`);
      if (action === 'start') {
        if (value.backend !== 'llama.cpp') throw new Error('Select llama.cpp to launch a managed GGUF model.');
        if (/^mmproj/i.test(name)) throw new Error('A projector is not a standalone model.');
        request.port = integer(body.port ?? 8090, 1024, 65535);
        request.gpuLayers = integer(body.gpuLayers ?? 0, 0, 999);
        request.contextLength = integer(body.contextLength ?? 4096, 512, 1048576);
        if (body.projector) { request.projector = fileName(body.projector); await regularModel(request.projector); }
        await regularModel(name);
      }
      if (action === 'import') {
        const { info } = await regularModel(name, true);
        request.sizeBytes = info.size;
        request.mtime = info.mtimeMs;
      }
      if (action === 'download') {
        if (typeof body.repo !== 'string' || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(body.repo)) throw new Error('Use a Hugging Face owner/repository.');
        const remoteFile = text(body.remoteFile, 1000);
        if (remoteFile.split('/').some(part => !part || part === '.' || part === '..') || remoteFile.includes('\\') || !remoteFile.toLowerCase().endsWith('.gguf')) throw new Error('Invalid Hugging Face GGUF path.');
        request.repo = body.repo;
        request.remoteFile = remoteFile;
      }
      if (['import', 'download'].includes(action) && await lstat(await managed(`models/${name}`)).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) throw new Error('Model already exists. Existing files are never overwritten.');
      if (action === 'remove') await regularModel(name);
      title = `${action} ${name}`;
      details = [`Managed model: ${path.join(directory, 'models', name)}`, action === 'import' ? `Copy ${request.sizeBytes} bytes from ~/LOCAL-AI-MODELS. Preserve the original.` : action === 'download' ? `Download ${request.repo}/${request.remoteFile} from Hugging Face. No publisher checksum verification.` : action === 'start' ? `llama-server on 127.0.0.1:${request.port}; context ${request.contextLength}; GPU layers ${request.gpuLayers}. Memory fit is not guaranteed.` : action === 'remove' ? 'Permanently delete this managed copy. Stop its runtime first. Originals outside DotCode remain untouched.' : 'Only a runtime or download started by this DotCode process can be stopped.'];
    } else if (body?.kind === 'agent') {
      const entry = agentEntry(body);
      files.push(...await agentFiles(value.agents, entry));
      request = { kind: 'agent', entry };
      title = `${entry.enabled ? 'Save' : 'Disable'} ${entry.category}: ${entry.name}`;
      details = [`Agent: ${entry.agent}. Scope: ${path.join(directory, 'workspace')}`, 'Apply native project files only. Do not edit global agent settings or other projects.', 'Existing files get a backup under runtime/backups. MCP definitions can execute code when a coding agent uses them; review commands and URLs. DotCode Copilot still disables MCP execution.'];
    } else throw new Error('Unknown runtime request.');
    for (const [id, item] of pending) if (item.expiresAt <= now()) pending.delete(id);
    if (pending.size >= 50) throw new Error('Too many pending plans. Wait for them to expire.');
    const id = randomUUID();
    const expiresAt = now() + TTL;
    const plan = { id, title, details, expiresAt, files, request, stateHash: digest(raw) };
    pending.set(id, plan);
    return { id, title, details, expiresAt, files: files.map(file => ({ path: path.join(directory, file.relative), content: file.content, remove: file.content === null })) };
  }

  async function verifyGGUF(target) {
    const handle = await open(target, 'r');
    try {
      const header = Buffer.alloc(4);
      const { bytesRead } = await handle.read(header, 0, 4, 0);
      if (bytesRead !== 4 || header.toString() !== 'GGUF') throw new Error('Downloaded/imported file is not a GGUF model.');
    } finally { await handle.close(); }
  }

  function launchDownload(request) {
    if (downloads.get(request.fileName)?.status === 'downloading') throw new Error('Model is already downloading.');
    const controller = new AbortController();
    const download = { fileName: request.fileName, status: 'downloading', receivedBytes: 0, totalBytes: 0, error: null, controller };
    downloads.set(request.fileName, download);
    const task = (async () => {
      const temporary = await managed(`models/${request.fileName}.${randomUUID()}.part`);
      let handle;
      try {
        await mkdir(path.dirname(temporary), { recursive: true, mode: 0o700 });
        const remote = request.remoteFile.split('/').map(encodeURIComponent).join('/');
        const response = await fetchRemote(`https://huggingface.co/${request.repo}/resolve/main/${remote}`, { signal: controller.signal, redirect: 'follow' });
        if (!response.ok || !response.body) throw new Error(`Download failed (HTTP ${response.status}).`);
        download.totalBytes = Number(response.headers.get('content-length')) || 0;
        handle = await open(temporary, 'wx', 0o600);
        for await (const chunk of response.body) {
          let offset = 0;
          while (offset < chunk.byteLength) { const written = await handle.write(chunk, offset, chunk.byteLength - offset); offset += written.bytesWritten; }
          download.receivedBytes += chunk.byteLength;
        }
        await handle.close(); handle = null;
        if (controller.signal.aborted) throw new Error('Download cancelled.');
        await verifyGGUF(temporary);
        await copyFile(temporary, await managed(`models/${request.fileName}`), constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
        download.status = 'complete';
      } catch (error) { download.status = controller.signal.aborted ? 'cancelled' : 'failed'; download.error = error.message; }
      finally { await handle?.close(); await rm(temporary, { force: true }); }
    })();
    jobs.add(task);
    task.finally(() => jobs.delete(task)).catch(() => {});
  }

  async function stopModel(name) {
    const runtime = processes.get(name);
    if (!runtime?.child || ['stopped', 'failed'].includes(runtime.status)) return;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { runtime.child.kill('SIGKILL'); reject(new Error('Model did not stop promptly. Check logs before retrying.')); }, 10000);
      runtime.child.once('exit', () => { clearTimeout(timeout); resolve(); });
      if (!runtime.child.kill('SIGTERM')) { clearTimeout(timeout); reject(new Error('Could not signal model process.')); }
    });
  }

  async function execute(id) {
    if (closed) throw new Error('Runtime is shutting down.');
    const approved = pending.get(id);
    if (!approved || approved.expiresAt <= now()) { pending.delete(id); throw new Error('Plan expired or already used.'); }
    if (executing) throw new Error('Another runtime action is running.');
    pending.delete(id);
    executing = true;
    try {
      const { raw, value } = await state();
      if (digest(raw) !== approved.stateHash) throw new Error('Runtime settings changed. Request a new plan.');
      for (const file of approved.files) if (await readOptional(await managed(file.relative)) !== file.previous) throw new Error('Target file changed. Request a new plan.');
      const request = approved.request;
      if (request.kind === 'service') {
        const service = value.services.find(item => item.id === request.id);
        if (request.action === 'adopt') service.adopted = true;
        else {
          if (!service.external && ['start', 'restart', 'enable'].includes(request.action)) {
            const unitPath = await managed(`runtime/units/${service.unit}`);
            await access(unitPath);
            const registered = path.join(home, '.config/systemd/user', service.unit);
            const existing = await realpath(registered).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
            if (existing && existing !== unitPath) throw new Error('A different unit already uses this name. It will not be replaced.');
            await command('systemctl', ['--user', 'link', unitPath]);
            await command('systemctl', ['--user', 'daemon-reload']);
          }
          await command('systemctl', ['--user', request.action, ...(request.action === 'enable' ? ['--now'] : []), service.unit]);
          const observed = await serviceStatus(service);
          if (observed.error || !observed.installed || (['start', 'restart', 'enable'].includes(request.action) && !observed.running) || (request.action === 'stop' && observed.running) || (request.action === 'enable' && !observed.autostart) || (request.action === 'disable' && observed.autostart)) throw new Error('Service action ran but verification failed. Inspect status and logs before retrying.');
        }
      } else if (request.kind === 'service-create') {
        await mkdir(await managed(`services/${request.service.id}/home`), { recursive: true, mode: 0o700 });
        for (const file of approved.files) await atomic(file.relative, file.content);
        value.services.push(request.service);
      } else if (request.kind === 'backend') {
        value.backend = request.backend;
        value.endpoint = request.endpoint;
      } else if (request.kind === 'agent') {
        for (const file of approved.files) {
          if (file.content === null) {
            if (file.previous !== null) { await atomic(`runtime/backups/${now()}-${randomUUID()}-SKILL.md`, file.previous); await rm(await managed(file.relative)); }
          } else await atomic(file.relative, file.content, true);
        }
        value.agents = [...value.agents.filter(entry => entry.id !== request.entry.id), request.entry];
      } else if (request.kind === 'model') {
        const name = request.fileName;
        const target = await managed(`models/${name}`);
        if (request.action === 'import') {
          const source = await regularModel(name, true);
          if (source.info.size !== request.sizeBytes || source.info.mtimeMs !== request.mtime) throw new Error('Source model changed. Request a new plan.');
          await verifyGGUF(source.target);
          await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
          await copyFile(source.target, target, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
          if ((await lstat(target)).size !== source.info.size) throw new Error('Model copy failed size verification.');
        } else if (request.action === 'start') {
          if (processes.get(name) && !['stopped', 'failed'].includes(processes.get(name).status)) throw new Error('Model is already running.');
          if ([...processes.values()].some(runtime => runtime.port === request.port && ['starting', 'running'].includes(runtime.status))) throw new Error('Another model uses that port.');
          await regularModel(name);
          await verifyGGUF(target);
          const args = ['--model', target, '--host', '127.0.0.1', '--port', String(request.port), '-c', String(request.contextLength), '-ngl', String(request.gpuLayers)];
          if (request.projector) { await regularModel(request.projector); args.push('--mmproj', await managed(`models/${request.projector}`)); }
          const runtime = { status: 'starting', port: request.port, error: null, logs: [] };
          await mkdir(await managed('runtime/model-home'), { recursive: true, mode: 0o700 });
          const child = spawnProcess('llama-server', args, { cwd: await managed('models'), env: { ...process.env, HOME: await managed('runtime/model-home') }, stdio: ['ignore', 'pipe', 'pipe'] });
          runtime.child = child;
          processes.set(name, runtime);
          const append = chunk => { runtime.logs.push(String(chunk).slice(-8000)); while (runtime.logs.join('').length > 64000) runtime.logs.shift(); };
          child.stdout.on('data', append);
          child.stderr.on('data', append);
          child.once('error', error => { runtime.status = 'failed'; runtime.error = error.message; });
          child.once('exit', (code, signal) => { runtime.status = code === 0 || signal === 'SIGTERM' ? 'stopped' : 'failed'; if (runtime.status === 'failed') runtime.error = `llama-server exited: ${signal ?? code}`; });
        } else if (request.action === 'stop') await stopModel(name);
        else if (request.action === 'remove') {
          if (processes.get(name) && !['stopped', 'failed'].includes(processes.get(name).status)) throw new Error('Stop the model before removing it.');
          await regularModel(name);
          await rm(target);
        } else if (request.action === 'download') launchDownload(request);
        else if (request.action === 'cancel') downloads.get(name)?.controller.abort();
      }
      value.history.push({ title: approved.title, at: new Date(now()).toISOString() });
      value.history = value.history.slice(-50);
      await atomic('runtime/state.json', JSON.stringify(value, null, 2) + '\n', true);
      return { ok: true, message: request.kind === 'model' && ['start', 'download'].includes(request.action) ? 'Started. Readiness/completion is reported separately.' : 'Action applied and configuration verified.' };
    } finally { executing = false; }
  }

  async function logs(id) {
    const service = (await state()).value.services.find(item => item.id === id);
    if (!service) throw new Error('Unknown service.');
    const { stdout } = await command('journalctl', ['--user', '-u', service.unit, '-n', '100', '--no-pager', '--output=cat']);
    return stdout.slice(-64000);
  }

  async function close() {
    closed = true;
    pending.clear();
    for (const download of downloads.values()) download.controller.abort();
    await Promise.allSettled([...processes.keys()].map(stopModel));
    await Promise.allSettled(jobs);
  }

  return { snapshot, plan, execute, logs, close };
}
