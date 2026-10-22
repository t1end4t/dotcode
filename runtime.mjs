import { execFile, spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, copyFile, link, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
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
const text = (value, limit = 32000, allowEmpty = false) => {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > limit || value.includes('\0')) throw new Error('Missing or invalid text.');
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
const defaultModelSettings = { port: 8090, contextLength: 4096, gpuLayers: 0 };
const launchSettings = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid model launch settings.');
  const settings = { port: integer(value.port, 1024, 65535), contextLength: integer(value.contextLength, 512, 1048576), gpuLayers: integer(value.gpuLayers, 0, 999) };
  if (value.projector !== undefined) settings.projector = fileName(value.projector);
  return settings;
};
const digest = value => createHash('sha256').update(value ?? '').digest('hex');
const contains = (root, target) => target === root || target.startsWith(root + path.sep);
const quoteUnit = value => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\r', '\\r').replaceAll('%', '%%') + '"';
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
  directory = path.resolve(directory ?? process.env.DOTCODE_HOME ?? path.join(home, '.dotcode'));
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

  async function checkUnitRegistration(service, create) {
    const registered = path.join(home, '.config/systemd/user', service.unit);
    const existing = await lstat(registered).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (existing && (create || !existing.isSymbolicLink() || await realpath(registered) !== await managed(`runtime/units/${service.unit}`))) throw new Error('A different unit already uses this name. It will not be overwritten.');
  }

  async function atomic(relative, content, backup = false, exclusive = false) {
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
      if (exclusive) await link(temporary, target);
      else await rename(temporary, target);
      if (await readFile(target, 'utf8') !== content) throw new Error('Written file failed verification.');
    } finally { await rm(temporary, { force: true }); }
  }

  async function state() {
    const raw = await readOptional(await managed('runtime/state.json'));
    const saved = raw === null ? {} : JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid runtime state. Restore a backup.');
    if (saved.services !== undefined && !Array.isArray(saved.services)) throw new Error('Invalid stored services.');
    const services = (saved.services ?? []).map(service => ({ ...service }));
    const serviceIds = new Set();
    const serviceUnits = new Set();
    for (const service of services) {
      slug(service.id);
      if (typeof service.external !== 'boolean' || typeof service.unit !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,239}\.service$/.test(service.unit) || (!service.external && service.unit !== `dotcode-${service.id}.service`)) throw new Error('Invalid stored service unit.');
      if (serviceIds.has(service.id) || serviceUnits.has(service.unit)) throw new Error('Duplicate stored service.');
      serviceIds.add(service.id);
      serviceUnits.add(service.unit);
      service.adopted = service.adopted === true;
      service.name = text(service.name, 100);
      service.port = integer(service.port, 1024, 65535);
      if (service.description !== undefined) service.description = text(service.description, 500, true);
      if (service.program !== undefined) {
        service.program = text(service.program, 4096);
        if (!path.isAbsolute(service.program) || /[\r\n]/.test(service.program)) throw new Error('Invalid stored executable.');
        service.args = service.shellCommand === undefined ? argsList(service.args ?? []) : ['bash', '-c', text(service.shellCommand)];
      }
      if (service.shellCommand !== undefined) service.shellCommand = text(service.shellCommand);
      if (service.preserveUserEnvironment !== undefined && typeof service.preserveUserEnvironment !== 'boolean') throw new Error('Invalid service environment setting.');
    }
    const storedSettings = saved.modelSettings === undefined ? {} : saved.modelSettings;
    if (!storedSettings || typeof storedSettings !== 'object' || Array.isArray(storedSettings)) throw new Error('Invalid stored model settings.');
    const modelSettings = Object.fromEntries(Object.entries(storedSettings).map(([name, settings]) => [fileName(name), launchSettings(settings)]));
    const agents = (saved.agents ?? []).map(agentEntry);
    const backend = saved.backend ?? 'llama.cpp';
    if (!['llama.cpp', 'external'].includes(backend)) throw new Error('Invalid stored model backend.');
    return { raw, value: { services, agents, backend, modelSettings, endpoint: backend === 'external' ? endpointURL(saved.endpoint) : '', history: (saved.history ?? []).slice(-50) } };
  }

  async function thinkingOsCommand(service, launchCommand) {
    const identity = service.external && service.unit.match(/^thinking-os-([a-z0-9]+(?:-[a-z0-9]+)*)\.service$/)?.[1];
    if (!identity) return {};
    const script = path.join(home, '.local/share/thinking-os/services', `${identity}.sh`);
    if (launchCommand !== `/usr/bin/env bash ${script}`) return {};
    try {
      if (await realpath(script) !== script) return {};
      const handle = await open(script, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        if (!(await handle.stat()).isFile()) return {};
        const buffer = Buffer.alloc(65537);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        if (bytesRead > 65536) return {};
        const [shebang, mode, cwd, env, ...lines] = buffer.toString('utf8', 0, bytesRead).split('\n');
        const workingDirectory = cwd?.match(/^cd -- '((?:[^'\n]|'"'"')*)'$/)?.[1];
        if (shebang !== '#!/usr/bin/env bash' || mode !== 'set -e' || workingDirectory === undefined || !/^export PATH='(?:[^'\n]|'"'"')*'$/.test(env ?? '')) return {};
        const scriptCommand = lines.join('\n').trim();
        return scriptCommand ? { scriptCommand, scriptWorkingDirectory: workingDirectory.replaceAll(`'"'"'`, "'"), scriptHash: digest(buffer.subarray(0, bytesRead)) } : {};
      } finally { await handle.close(); }
    } catch { return {}; }
  }

  async function serviceStatus(service) {
    try {
      const { stdout } = await command('systemctl', ['--user', 'show', service.unit, '--property=LoadState,ActiveState,SubState,UnitFileState,MainPID,ExecStart,WorkingDirectory']);
      const props = Object.fromEntries(stdout.trim().split('\n').map(line => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }));
      const launchCommand = props.ExecStart?.match(/argv\[\]=(.*?) ;/s)?.[1] || props.ExecStart || '';
      return { ...service, installed: props.LoadState === 'loaded', running: props.ActiveState === 'active', status: props.ActiveState || 'unknown', autostart: ['enabled', 'enabled-runtime'].includes(props.UnitFileState), pid: Number(props.MainPID) || null, command: launchCommand, workingDirectory: props.WorkingDirectory || '', ...await thinkingOsCommand(service, launchCommand) };
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
    const models = (await modelFiles(await managed('models'))).map(model => ({ ...model, settings: value.modelSettings[model.fileName] ?? { ...defaultModelSettings } }));
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
      if (!service || !['adopt', 'start', 'stop', 'restart', 'enable', 'disable', 'remove'].includes(body.action)) throw new Error('Unknown service or action.');
      if (body.action === 'adopt' && !service.external) throw new Error('No legacy unit to adopt.');
      if (body.action === 'remove' && service.external) throw new Error('Cannot remove an external unit. Move to DotCode first.');
      if (service.external && !service.adopted && body.action !== 'adopt') throw new Error('Take over this existing service before controlling it.');
      request = { kind: 'service', id: service.id, action: body.action };
      title = `${body.action === 'adopt' ? 'Take over' : body.action} ${service.name}`;
      details = [`Unit: ${service.unit}`, body.action === 'adopt' ? 'Save its existing unit reference in DotCode. Do not restart, reinstall or relocate it.' : `systemctl --user ${body.action === 'enable' ? 'enable --now' : body.action} ${service.unit}`, service.external ? 'Existing installation, credentials, Docker volume and workspace mounts remain external and unchanged.' : 'New unit definitions and working data stay inside DOTCODE_HOME. systemd registration links are the only exception.', body.action === 'disable' ? 'Disabling autostart does not stop the running service.' : 'Autostart means the user systemd default target, not guaranteed startup before login.'];
      if (body.action === 'remove') {
        await checkUnitRegistration(service, false);
        details = [`Stop ${service.name}, disable autostart and delete its DotCode-owned unit and service entry.`, 'Back up the unit under runtime/backups. Preserve installed programs, credentials and working data.'];
      }
      if (!service.external && body.action !== 'adopt') {
        const relative = `runtime/units/${service.unit}`;
        const previous = await readOptional(await managed(relative));
        if (previous === null && ['start', 'restart', 'enable'].includes(body.action)) throw new Error('No DotCode unit exists for this service. Create one first.');
        files.push({ relative, previous, ...(body.action === 'remove' ? { content: null } : { checkOnly: true }) });
      }
    } else if (['service-create', 'service-update', 'service-migrate'].includes(body?.kind)) {
      const create = body.kind === 'service-create';
      const migrate = body.kind === 'service-migrate';
      const id = create ? slug(body.name) : body.id;
      const existing = value.services.find(service => service.id === id);
      if (create && existing) throw new Error('A service already uses that name.');
      if (!create && !existing) throw new Error('Unknown service.');
      const service = create ? { id, name: id, unit: `dotcode-${id}.service`, external: false, adopted: true } : { ...existing, name: migrate ? existing.name : text(body.name, 100) };
      service.port = integer(migrate ? service.port : body.port, 1024, 65535);
      if (body.description !== undefined) service.description = text(body.description, 500, true);
      request = { kind: body.kind, service };
      title = `${create ? 'Create' : migrate ? 'Migrate' : 'Update'} ${service.name} service`;
      details = [`Display name: ${service.name}`, `Port: ${service.port} (card metadata only; does not configure the executable)`, `Description: ${service.description ?? ''}`, 'Metadata edits do not change the unit, adoption or running process.'];
      if (migrate) {
        if (!existing.external) throw new Error('This service is already managed by DotCode.');
        const observed = await serviceStatus(existing);
        if (observed.error || !observed.installed || !observed.scriptCommand) throw new Error('Cannot migrate this external command automatically. Its generated wrapper must be available and recognized.');
        request.migration = { unit: existing.unit, command: observed.command, scriptHash: observed.scriptHash, running: observed.running, autostart: observed.autostart };
        Object.assign(service, { unit: `dotcode-${slug(id)}.service`, external: false, adopted: true, shellCommand: observed.scriptCommand, preserveUserEnvironment: true });
        details = ['Copy the command into a DotCode-owned unit with an editable command and a working folder under DOTCODE_HOME.', 'Preserve existing user credentials, Docker volumes and command arguments. Relative paths and $PWD now use the managed working folder.', 'Disable the old unit. Preserve running and autostart states on the new unit. Restore the old service if migration fails.'];
      }
      if (create || migrate || Object.hasOwn(body, 'program') || Object.hasOwn(body, 'shellCommand')) {
        if (service.external) throw new Error('External service executables cannot be edited. Existing units remain unchanged.');
        if (Object.hasOwn(body, 'program') && Object.hasOwn(body, 'shellCommand')) throw new Error('Choose an executable or a shell command, not both.');
        const shellCommand = migrate ? service.shellCommand : Object.hasOwn(body, 'shellCommand') ? text(body.shellCommand) : undefined;
        const program = shellCommand === undefined ? text(body.program, 4096) : '/usr/bin/env';
        if (/[\r\n]/.test(program)) throw new Error('Invalid executable.');
        let executable;
        for (const candidate of path.isAbsolute(program) ? [program] : (process.env.PATH ?? '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, program))) {
          try { await access(candidate, constants.X_OK); if ((await lstat(await realpath(candidate))).isFile()) { executable = path.resolve(candidate); break; } } catch {}
        }
        if (!executable) throw new Error('Executable not found. Install it through Tool Library first.');
        const args = shellCommand === undefined ? argsList(body.args ?? []) : ['bash', '-c', shellCommand];
        const cwd = await managed(`services/${id}`);
        if (/[\r\n\0]/.test(cwd)) throw new Error("Invalid service working folder.");
        const relative = `runtime/units/${service.unit}`;
        const previous = await readOptional(await managed(relative));
        if (create && previous !== null) throw new Error('Unit already exists. It will not be overwritten.');
        await checkUnitRegistration(service, create);
        const serviceHome = service.preserveUserEnvironment ? home : `${cwd}/home`;
        const content = `[Unit]\nDescription=DotCode ${id}\nAfter=network-online.target\n\n[Service]\nType=simple\nWorkingDirectory=${cwd.replaceAll('%', '%%')}\nEnvironment=${quoteUnit(`HOME=${serviceHome}`)}\nEnvironment=${quoteUnit(`XDG_CONFIG_HOME=${serviceHome}/.config`)}\nEnvironment=${quoteUnit(`XDG_DATA_HOME=${serviceHome}/.local/share`)}\nEnvironment=${quoteUnit(`XDG_CACHE_HOME=${serviceHome}/.cache`)}\nEnvironment=${quoteUnit(`PATH=${process.env.PATH ?? ''}`)}\nExecStart=${[executable, ...args].map(arg => quoteUnit(arg).replaceAll('$', () => '$$')).join(' ')}\nRestart=on-failure\nRestartSec=3\nUMask=0077\n\n[Install]\nWantedBy=default.target\n`;
        if (migrate && previous !== null && previous !== content) throw new Error('A different managed unit already exists. It will not be overwritten.');
        service.program = executable;
        service.args = args;
        if (shellCommand !== undefined) service.shellCommand = shellCommand;
        else delete service.shellCommand;
        files.push({ relative, previous, content });
        details.push(`Executable: ${executable}`, `Arguments: ${JSON.stringify(args)}`, `Working folder: ${cwd}`, migrate ? 'Switch to the new unit now, restarting only if currently running. This is a host process, not the assistant sandbox.' : create ? 'Create the unit only. Start and autostart require separate approval. This is a host process, not the assistant sandbox.' : 'Replace the full managed unit shown below; back up the previous file under runtime/backups. No automatic restart, start or autostart change. Restart requires separate approval. This is a host process, not the assistant sandbox.');
      }
    } else if (body?.kind === 'backend') {
      if (!['llama.cpp', 'external'].includes(body.backend)) throw new Error('Unknown backend.');
      request = { kind: 'backend', backend: body.backend, endpoint: body.backend === 'external' ? endpointURL(body.endpoint) : '' };
      title = `Use ${body.backend === 'external' ? 'custom local endpoint' : 'llama.cpp'}`;
      details = [request.endpoint || 'Use the installed llama-server executable. No inference engine is installed.', 'Changing the selector does not stop existing models or change the Copilot provider.'];
    } else if (body?.kind === 'model') {
      const name = fileName(body.fileName);
      const action = body.action;
      if (!['start', 'stop', 'remove', 'import', 'download', 'cancel', 'configure'].includes(action)) throw new Error('Unknown model action.');
      request = { kind: 'model', action, fileName: name };
      await managed(`models/${name}`);
      if (action === 'start' || action === 'configure') {
        if (action === 'start' && value.backend !== 'llama.cpp') throw new Error('Select llama.cpp to launch a managed GGUF model.');
        if (action === 'start' && /^mmproj/i.test(name)) throw new Error('A projector is not a standalone model.');
        const savedSettings = value.modelSettings[name] ?? defaultModelSettings;
        Object.assign(request, launchSettings(action === 'configure' ? body : {
          port: body.port ?? savedSettings.port,
          contextLength: body.contextLength ?? savedSettings.contextLength,
          gpuLayers: body.gpuLayers ?? savedSettings.gpuLayers,
          projector: body.projector === undefined ? savedSettings.projector : body.projector || undefined,
        }));
        if (request.projector) await regularModel(request.projector);
        const model = await regularModel(name);
        if (action === 'configure') await verifyGGUF(model.target);
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
      details = [`Managed model: ${path.join(directory, 'models', name)}`, action === 'import' ? `Copy ${request.sizeBytes} bytes from ~/LOCAL-AI-MODELS. Preserve the original.` : action === 'download' ? `Download ${request.repo}/${request.remoteFile} from Hugging Face. No publisher checksum verification.` : ['start', 'configure'].includes(action) ? `llama-server on 127.0.0.1:${request.port}; context ${request.contextLength}; GPU layers ${request.gpuLayers}; projector ${request.projector ?? 'none'}. Memory fit is not guaranteed.` : action === 'remove' ? 'Permanently delete this managed copy. Stop its runtime first. Originals outside DotCode remain untouched.' : 'Only a runtime or download started by this DotCode process can be stopped.'];
      if (action === 'configure') details.push('Save settings for this file only. Apply on next launch; do not spawn, stop or restart the current model.');
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
        else if (request.action === 'remove') {
          await checkUnitRegistration(service, false);
          await command('systemctl', ['--user', 'stop', service.unit]);
          await command('systemctl', ['--user', 'disable', service.unit]);
          const stopped = await serviceStatus(service);
          if (stopped.error || stopped.running || stopped.autostart || !['inactive', 'failed'].includes(stopped.status)) throw new Error('Service could not be stopped and disabled. Its entry and unit were kept.');
          for (const file of approved.files) {
            if (file.previous !== null) {
              await atomic(`runtime/backups/${now()}-${randomUUID()}-${service.unit}`, file.previous);
              await rm(await managed(file.relative));
            }
          }
          await command('systemctl', ['--user', 'daemon-reload']);
          const removed = await serviceStatus(service);
          if (removed.error || removed.installed || removed.running || removed.autostart) throw new Error('Service removal verification failed. Entry kept; unit backup is in runtime/backups.');
          value.services = value.services.filter(item => item.id !== service.id);
        }
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
      } else if (request.kind === 'service-migrate') {
        const { service, migration } = request;
        const original = value.services.find(item => item.id === service.id);
        const observed = await serviceStatus(original);
        if (observed.error || !observed.installed || ['command', 'scriptHash', 'running', 'autostart'].some(key => observed[key] !== migration[key])) throw new Error('External service changed. Request a new migration plan.');
        await checkUnitRegistration(service, false);
        await mkdir(await managed(`services/${service.id}/home`), { recursive: true, mode: 0o700 });
        for (const file of approved.files) await atomic(file.relative, file.content, true, file.previous === null);
        let linked = false;
        let stopped = false;
        try {
          await command('systemctl', ['--user', 'link', await managed(`runtime/units/${service.unit}`)]);
          linked = true;
          await command('systemctl', ['--user', 'daemon-reload']);
          const prepared = await serviceStatus(service);
          if (prepared.error || !prepared.installed) throw new Error('The new unit could not load. The original service has not been stopped.');
          stopped = true;
          await command('systemctl', ['--user', 'stop', original.unit]);
          await command('systemctl', ['--user', 'disable', original.unit]);
          const retired = await serviceStatus(original);
          if (retired.error || retired.running || retired.autostart) throw new Error('Old service did not stop or disable.');
          if (migration.autostart) await command('systemctl', ['--user', 'enable', service.unit]);
          if (migration.running) await command('systemctl', ['--user', 'start', service.unit]);
          const migrated = await serviceStatus(service);
          if (migrated.error || !migrated.installed || migrated.running !== migration.running || migrated.autostart !== migration.autostart) throw new Error('Migrated service failed verification.');
          value.services = value.services.map(item => item.id === service.id ? service : item);
          value.history.push({ title: approved.title, at: new Date(now()).toISOString() });
          value.history = value.history.slice(-50);
          await atomic('runtime/state.json', JSON.stringify(value, null, 2) + '\n', true);
          return { ok: true, message: 'Service moved to DotCode. Its command is editable; running and autostart states were preserved.' };
        } catch (error) {
          const failures = [];
          const restore = async args => { try { await command('systemctl', ['--user', ...args]); } catch (failure) { failures.push(failure.message); } };
          if (linked) {
            try { await command('systemctl', ['--user', 'stop', service.unit]); }
            catch (failure) {
              const remaining = await serviceStatus(service);
              if (remaining.error || remaining.running) failures.push(failure.message);
            }
            await restore(['disable', service.unit]);
          }
          if (stopped && migration.autostart) await restore(['enable', original.unit]);
          if (stopped && migration.running) await restore(['start', original.unit]);
          if (stopped) {
            const restored = await serviceStatus(original);
            if (restored.error || !restored.installed || restored.running !== migration.running || restored.autostart !== migration.autostart) failures.push('Original service state could not be restored. Inspect its logs.');
          }
          if (failures.length) throw new Error(`${error.message} Rollback needs attention: ${failures.join('; ')}`);
          throw error;
        }
      } else if (request.kind === 'service-create' || request.kind === 'service-update') {
        const create = request.kind === 'service-create';
        if (approved.files.length) {
          await checkUnitRegistration(request.service, create);
          await mkdir(await managed(`services/${request.service.id}/home`), { recursive: true, mode: 0o700 });
          for (const file of approved.files) await atomic(file.relative, file.content, !create, create || file.previous === null);
        }
        if (create) value.services.push(request.service);
        else value.services = value.services.map(service => service.id === request.service.id ? request.service : service);
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
        } else if (request.action === 'configure') {
          const model = await regularModel(name);
          await verifyGGUF(model.target);
          if (request.projector) await regularModel(request.projector);
          value.modelSettings[name] = launchSettings(request);
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
          delete value.modelSettings[name];
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
