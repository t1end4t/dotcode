import { createGithub } from './github.mjs';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rename, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

export class InstallerError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const conflict = target => { throw new InstallerError('CONFLICT', `Path is not owned by this Component: ${target}`); };
const optionalStat = target => lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
const agentNames = ['codex', 'claude'];

function source(value) {
  if (!value || typeof value.githubUrl !== 'string' || !/^https:\/\/github\.com\/[\w-]+\/[\w.-]+\/?$/.test(value.githubUrl)) throw new InstallerError('INVALID_INPUT', 'Use a GitHub repository URL.');
  const githubUrl = value.githubUrl.replace(/\/$/, '').replace(/\.git$/, '').toLowerCase();
  if (['.', '..'].includes(githubUrl.split('/').at(-1))) throw new InstallerError('INVALID_INPUT', 'Invalid repository name.');
  const subpath = value.subpath ?? '';
  if (typeof subpath !== 'string' || subpath.length > 1000 || (subpath && !subpath.split('/').every(part => /^[\w.-]+$/.test(part) && !['.', '..', '.git'].includes(part)))) throw new InstallerError('INVALID_INPUT', 'Use a relative skill directory without traversal.');
  const ref = value.ref ?? 'HEAD';
  if (typeof ref !== 'string' || !ref || ref.length > 200 || /[\0\r\n]/.test(ref)) throw new InstallerError('INVALID_INPUT', 'Invalid Git ref.');
  return { githubUrl, subpath, ref };
}

export function createInstaller({ directory, home = homedir(), run = promisify(execFile), fetchRemote = globalThis.fetch, now = Date.now, searchPath = process.env.PATH ?? '', env = process.env } = {}) {
  home = path.resolve(home);
  directory = path.resolve(directory ?? process.env.DOTCODE_HOME ?? path.join(home, '.dotcode'));
  const contains = (root, target) => target === root || target.startsWith(root + path.sep);
  const appDirectory = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');
  if (directory === home || directory === path.parse(directory).root || [appDirectory, path.join(home, 'nix-dev/nixos-conf')].some(root => contains(root, directory) || contains(directory, root))) throw new Error('Installer data must be separate from source, home and NixOS configuration.');
  const receiptFile = path.join(directory, 'receipts.json');
  const pending = new Map();
  let executing = false;
  const github = createGithub({ fetchRemote, run, now, env });
  const componentId = value => createHash('sha256').update(`${value.githubUrl}\n${value.type ? `cli\n${value.type}\n${value.attribute}` : value.subpath}`).digest('hex').slice(0, 24);
  const storePath = (id, version, kind = 'skill', outputName = 'out') => path.join(directory, kind === 'cli' ? 'store/nix' : 'store/skills', id, version + (outputName === 'out' ? '' : `-${outputName}`));
  const activationPath = (agent, name) => path.join(home, agent === 'codex' ? '.agents' : '.claude', 'skills', name);
  const onPath = target => searchPath.split(path.delimiter).some(entry => entry && path.resolve(entry) === target);
  const cliDirectory = () => path.join(home, onPath(path.join(home, '.local/bin')) ? '.local/bin' : '.dotcode/bin');
  const activationKeys = receipt => receipt.kind === 'cli' ? ['cli'] : agentNames;
  const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  const wrapper = receipt => `#!/bin/sh\n# managed-by: dotcode\n# component: ${receipt.id}\nexec ${shellQuote(path.join(receipt.storePath, 'bin', receipt.name))} "$@"\n`;
  const validName = name => typeof name === 'string' && /^[\w.+-]{1,100}$/.test(name) && !['.', '..'].includes(name);

  async function checkParents(target) {
    let cursor = path.parse(target).root;
    for (const part of path.dirname(target).slice(cursor.length).split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, part);
      const info = await optionalStat(cursor);
      if (info && !info.isDirectory()) conflict(cursor);
    }
  }

  async function state() {
    await checkParents(receiptFile);
    const info = await optionalStat(receiptFile);
    if (info && !info.isFile()) conflict(receiptFile);
    const raw = info ? await readFile(receiptFile, 'utf8') : null;
    const value = raw === null ? { receipts: [] } : JSON.parse(raw);
    if (!value || !Array.isArray(value.receipts)) throw new Error('Invalid Receipt file. Restore it before continuing.');
    const ids = new Set();
    for (const receipt of value.receipts) {
      const value = source(receipt?.recipe?.source);
      const cli = receipt.kind === 'cli';
      const recipeSource = cli ? nixSource(receipt.recipe.source) : value;
      const validActivation = cli
        ? [path.join(home, '.local/bin', receipt.name), path.join(home, '.dotcode/bin', receipt.name)].includes(receipt.activations?.cli?.path)
        : agentNames.every(agent => receipt.activations?.[agent]?.path === activationPath(agent, receipt.name));
      if ((cli ? receipt.recipe.backend !== 'nix' || receipt.recipe.binary !== receipt.name || !validName(receipt.outputName) || typeof receipt.outputPath !== 'string' || !path.isAbsolute(receipt.outputPath) : receipt.kind !== 'skill' || receipt.recipe.backend !== 'files') || receipt.id !== componentId(recipeSource) || ids.has(receipt.id) || !/^[\da-f]{40}$/.test(receipt.version) || !validName(receipt.name) || receipt.storePath !== storePath(receipt.id, receipt.version, receipt.kind, receipt.outputName) || !validActivation) throw new Error('Invalid stored Receipt. File unchanged.');
      ids.add(receipt.id);
    }
    return { raw, receipts: value.receipts };
  }

  async function save(receipts) {
    await checkParents(receiptFile);
    const info = await optionalStat(receiptFile);
    if (info && !info.isFile()) conflict(receiptFile);
    if (!receipts.length) {
      if (info) await unlink(receiptFile);
      return;
    }
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${receiptFile}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ receipts }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      await rename(temporary, receiptFile);
    } finally { await rm(temporary, { force: true }); }
  }

  async function activations(receipt) {
    const result = {};
    for (const agent of activationKeys(receipt)) {
      const target = receipt.activations[agent].path;
      await checkParents(target);
      const info = await optionalStat(target);
      if (info && !await ownsActivation(receipt, target, info)) conflict(target);
      result[agent] = { path: target, enabled: Boolean(info) };
    }
    return result;
  }

  async function ownsActivation(receipt, target, info) {
    return receipt.kind === 'cli'
      ? info.isFile() && await readFile(target, 'utf8') === wrapper(receipt)
      : info.isSymbolicLink() && path.resolve(path.dirname(target), await readlink(target)) === receipt.storePath;
  }

  async function snapshot() {
    const saved = await state();
    return { receipts: await Promise.all(saved.receipts.map(async receipt => {
      // A Receipt records history; lstat establishes current Activation ownership.
      try {
        await checkStore(receipt);
        const current = await activations(receipt);
        return { ...receipt, ...(receipt.kind === 'cli' ? { needsPath: !onPath(path.dirname(receipt.activations.cli.path)) } : {}), activations: current, status: activationKeys(receipt).some(agent => current[agent].enabled) ? 'enabled' : 'disabled' };
      } catch (error) { return { ...receipt, activations: Object.fromEntries(activationKeys(receipt).map(agent => [agent, { path: receipt.activations[agent].path, enabled: false }])), status: 'conflict', error: error.message }; }
    })) };
  }


  const freshDetection = detection => detection && !detection.error && now() - Date.parse(detection.checkedAt) >= 0 && now() - Date.parse(detection.checkedAt) <= 24 * 60 * 60 * 1000;

  async function repository(value) {
    const repo = value.githubUrl.slice('https://github.com/'.length);
    const revision = await github.request(`/repos/${repo}/commits/${encodeURIComponent(value.ref)}`);
    if (!/^[\da-f]{40}$/.test(revision.sha)) throw new Error('GitHub returned an invalid commit.');
    const tree = await github.request(`/repos/${repo}/git/trees/${revision.sha}?recursive=1`);
    if (!Array.isArray(tree.tree) || tree.truncated) throw new Error('Cannot detect Components from an incomplete GitHub tree.');
    return { version: revision.sha, tree: tree.tree };
  }

  async function detectSkill(value, detection) {
    if (value.ref === 'HEAD' && freshDetection(detection)) {
      if (!detection.skillPaths.includes(value.subpath)) throw new InstallerError('NOT_SKILL', 'No SKILL.md or skill.md in that directory.');
      return detection.commit;
    }
    const { version, tree } = await repository(value);
    const marker = value.subpath ? `${value.subpath}/` : '';
    if (!tree.some(entry => [marker + 'SKILL.md', marker + 'skill.md'].includes(entry.path) && entry.type === 'blob' && ['100644', '100755'].includes(entry.mode))) throw new InstallerError('NOT_SKILL', 'No SKILL.md or skill.md in that directory.');
    return version;
  }

  const nixJSON = async args => JSON.parse((await run('nix', args, { timeout: 120000, maxBuffer: 4 * 1024 * 1024 })).stdout);
  const validAttribute = value => typeof value === 'string' && /^[a-zA-Z_][\w-]*(\.[a-zA-Z_][\w-]*)*$/.test(value);

  function nixSource(value) {
    const normalized = source(value);
    if (normalized.subpath || !['flake', 'nixpkgs'].includes(value.type) || (value.type === 'flake' ? value.attribute !== '' : !validAttribute(value.attribute))) throw new InstallerError('INVALID_INPUT', 'Choose a detected Nix Recipe.');
    return { ...normalized, type: value.type, attribute: value.attribute };
  }

  const installable = receipt => `${receipt.recipe.source.type === 'flake' ? 'github:' + receipt.recipe.source.githubUrl.slice('https://github.com/'.length) : 'github:NixOS/nixpkgs'}/${receipt.version}#${receipt.recipe.source.attribute}`;

  async function detect(body) {
    const value = source(body);
    const { tree, version } = await repository(value);
    const candidates = [];
    const warnings = [];
    const candidate = (type, attribute, reason) => ({ kind: 'cli', recipe: { backend: 'nix', source: { ...value, type, attribute } }, reason });
    // ponytail: flake detection offers the default package; enumerate variants when selection is supported.
    if (!value.subpath && tree.some(entry => entry.path === 'flake.nix' && entry.type === 'blob' && ['100644', '100755'].includes(entry.mode))) {
      candidates.push(candidate('flake', '', 'Repository flake takes priority on NixOS.'));
    }
    let packages = {};
    try { packages = await nixJSON(['search', '--json', 'nixpkgs', '(' + value.githubUrl.split('/').at(-1).replaceAll('.', '[._-]') + ')']); }
    catch (error) { warnings.push(`Could not search nixpkgs: ${error.message}`); }
    for (const key of Object.keys(packages)) {
      const attribute = key.replace(/^legacyPackages\.[^.]+\./, '');
      if (!validAttribute(attribute)) continue;
      let meta;
      try { meta = await nixJSON(['eval', '--json', `nixpkgs#${attribute}`, '--apply', 'p: { homepage = p.meta.homepage or null; changelog = p.meta.changelog or null; sourceUrl = p.src.url or null; }']); }
      catch (error) { warnings.push(`Could not inspect nixpkgs ${attribute}: ${error.message}`); continue; }
      const urls = [meta.homepage, meta.changelog, meta.sourceUrl].flat();
      if (urls.some(url => typeof url === 'string' && (url.toLowerCase().replace(/\/$/, '').replace(/\.git$/, '') === value.githubUrl || url.toLowerCase().startsWith(value.githubUrl + '/')))) {
        candidates.push(candidate('nixpkgs', attribute, 'Matching nixpkgs package is preferred after the repository flake on NixOS.'));
      }
    }
    return { candidates, version, warnings };
  }

  async function plan(body, detection) {
    if (!body || !['install', 'enable', 'disable', 'uninstall'].includes(body.action)) throw new InstallerError('INVALID_INPUT', 'Invalid installer action.');
    const saved = await state();
    let receipt;
    if (body.action === 'install') {
      const value = source(body);
      if (body.recipe?.backend === 'nix') {
        const selected = nixSource(body.recipe.source);
        if (JSON.stringify(source(selected)) !== JSON.stringify(value)) throw new InstallerError('INVALID_INPUT', 'Recipe must belong to the selected Card.');
        const { candidates, version: repoVersion, warnings } = await detect(value);
        if (!candidates.some(candidate => JSON.stringify(candidate.recipe.source) === JSON.stringify(selected))) {
          if (warnings.length) throw new InstallerError('SOURCE_ERROR', warnings.join('\n'));
          throw new InstallerError('INVALID_INPUT', 'Choose a detected Nix Recipe.');
        }
        const id = componentId(selected);
        if (saved.receipts.some(item => item.id === id)) throw new InstallerError('CONFLICT', 'Component is already installed.');
        const version = selected.type === 'flake' ? repoVersion : (await nixJSON(['flake', 'metadata', '--json', 'nixpkgs'])).locked?.rev;
        if (!/^[\da-f]{40}$/.test(version)) throw new InstallerError('SOURCE_ERROR', 'Nix returned an invalid revision.');
        receipt = { id, kind: 'cli', recipe: { backend: 'nix', source: selected }, version, storePath: storePath(id, version, 'cli'), installedAt: new Date(now()).toISOString() };
        const metadata = await nixJSON(['eval', '--json', installable(receipt), '--apply', 'p: { mainProgram = p.meta.mainProgram or null; pname = p.pname or null; outputName = (p.bin or p).outputName or "out"; outputPath = (p.bin or p).outPath; }']);
        const name = metadata.mainProgram ?? metadata.pname ?? value.githubUrl.split('/').at(-1);
        if (!validName(name)) throw new InstallerError('INVALID_SOURCE', 'Nix package has an invalid CLI name.');
        receipt.name = name;
        receipt.outputName = metadata.outputName ?? 'out';
        if (!validName(receipt.outputName)) throw new InstallerError('INVALID_SOURCE', 'Nix package has an invalid output name.');
        receipt.outputPath = metadata.outputPath;
        if (typeof receipt.outputPath !== 'string' || !path.isAbsolute(receipt.outputPath)) throw new InstallerError('INVALID_SOURCE', 'Nix returned an invalid output path.');
        receipt.storePath = storePath(id, version, 'cli', receipt.outputName);
        receipt.recipe.binary = name;
        receipt.activations = { cli: { path: path.join(cliDirectory(), name) } };
      } else {
        if (body.recipe && body.recipe.backend !== 'files') throw new InstallerError('INVALID_INPUT', 'Unsupported Backend.');
        const id = componentId(value);
        if (saved.receipts.some(receipt => receipt.id === id)) throw new InstallerError('CONFLICT', 'Component is already installed.');
        const name = value.subpath.split('/').at(-1) || value.githubUrl.split('/').at(-1);
        if (!/^[\w.-]{1,100}$/.test(name)) throw new InstallerError('INVALID_INPUT', 'Skill directory name is too long.');
        const version = await detectSkill(value, detection);
        receipt = { id, name, kind: 'skill', recipe: { backend: 'files', source: value }, version, storePath: storePath(id, version), installedAt: new Date(now()).toISOString(), activations: Object.fromEntries(agentNames.map(agent => [agent, { path: activationPath(agent, name) }])) };
      }
    } else {
      receipt = saved.receipts.find(receipt => receipt.id === body.componentId);
      if (!receipt || (receipt.kind === 'skill' && body.action !== 'uninstall' && !agentNames.includes(body.agent))) throw new InstallerError('INVALID_INPUT', 'Choose an installed Component and agent.');
    }
    const current = await activations(receipt);
    await checkStore(receipt, body.action === 'install');
    if (body.action === 'install' && activationKeys(receipt).some(agent => current[agent].enabled)) conflict(receipt.storePath);
    const approved = { id: randomUUID(), action: body.action, componentId: receipt.id, version: receipt.version, expiresAt: now() + 15 * 60 * 1000 };
    for (const [key, pendingPlan] of pending) if (pendingPlan.public.expiresAt < now()) pending.delete(key);
    pending.set(approved.id, { public: approved, receipt, agent: body.agent, raw: saved.raw, current });
    return { ...approved };
  }

  async function checkStore(receipt, installing = false) {
    await checkParents(receipt.storePath);
    const info = await optionalStat(receipt.storePath);
    if (installing ? info : receipt.kind === 'cli' ? !info?.isSymbolicLink() || await readlink(receipt.storePath) !== receipt.outputPath : !info?.isDirectory()) conflict(receipt.storePath);
  }

  async function buildNix(receipt) {
    await mkdir(path.dirname(receipt.storePath), { recursive: true, mode: 0o700 });
    try {
      await run('nix', ['build', `${installable(receipt)}^${receipt.outputName}`, '--out-link', storePath(receipt.id, receipt.version, 'cli')], { timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
      await checkStore(receipt);
      const binary = await stat(path.join(receipt.storePath, 'bin', receipt.name));
      if (!binary.isFile() || !(binary.mode & 0o111)) throw new InstallerError('INVALID_SOURCE', 'Nix output does not contain the executable CLI.');
    } catch (error) {
      await removeStore(receipt);
      throw error;
    }
  }

  async function removeStore(receipt, target = receipt.storePath) {
    await checkParents(target);
    const info = await optionalStat(target);
    if (!info) return;
    if (receipt.kind === 'cli') {
      if (!info.isSymbolicLink() || await readlink(target) !== receipt.outputPath) conflict(target);
      await unlink(target);
    } else {
      if (!info.isDirectory()) conflict(target);
      await rm(target, { recursive: true });
    }
  }

  async function createActivation(receipt, target) {
    await checkParents(target);
    await mkdir(path.dirname(target), { recursive: true });
    if (receipt.kind === 'cli') await writeFile(target, wrapper(receipt), { flag: 'wx', mode: 0o755 });
    else await symlink(receipt.storePath, target);
  }

  async function checkTree(target) {
    const info = await lstat(target);
    // ponytail: skills contain regular files and directories; add validated internal symlinks when needed.
    if (!info.isDirectory() && !info.isFile()) throw new InstallerError('INVALID_SOURCE', 'Skill contents must be regular files and directories.');
    if (info.isDirectory()) for (const name of await readdir(target)) if (name !== '.git') await checkTree(path.join(target, name));
  }

  async function checkout(receipt) {
    const stagingRoot = path.join(directory, 'staging');
    await checkParents(path.join(stagingRoot, 'checkout'));
    await mkdir(stagingRoot, { recursive: true, mode: 0o700 });
    const temporary = await mkdtemp(path.join(stagingRoot, 'skill-'));
    const checkoutDirectory = path.join(temporary, 'checkout');
    await mkdir(checkoutDirectory);
    const git = args => run('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: checkoutDirectory, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, timeout: 120000, maxBuffer: 1024 * 1024 });
    try {
      await git(['init']);
      await git(['remote', 'add', 'origin', receipt.recipe.source.githubUrl + '.git']);
      await git(['fetch', '--depth=1', '--filter=blob:none', 'origin', receipt.version]);
      if (receipt.recipe.source.subpath) await git(['sparse-checkout', 'set', '--no-cone', '/' + receipt.recipe.source.subpath + '/']);
      await git(['checkout', '--detach', 'FETCH_HEAD']);
      if ((await git(['rev-parse', 'HEAD'])).stdout.trim() !== receipt.version) throw new Error('Checkout does not match the pinned commit.');
      const skill = path.join(checkoutDirectory, receipt.recipe.source.subpath);
      await checkParents(path.join(skill, 'SKILL.md'));
      await checkTree(skill);
      if (!(await Promise.all(['SKILL.md', 'skill.md'].map(name => optionalStat(path.join(skill, name))))).some(info => info?.isFile())) throw new Error('Checkout has no skill marker.');
      await checkParents(receipt.storePath);
      if (await optionalStat(receipt.storePath)) conflict(receipt.storePath);
      await mkdir(path.dirname(receipt.storePath), { recursive: true, mode: 0o700 });
      const payload = path.join(temporary, 'payload');
      await cp(skill, payload, { recursive: true, errorOnExist: true, force: false, filter: target => path.basename(target) !== '.git' });
      await checkStore(receipt, true);
      await rename(payload, receipt.storePath);
    } finally { await rm(temporary, { recursive: true, force: true }); }
  }

  async function execute(id) {
    if (executing) throw new InstallerError('BUSY', 'Another installer action is running.');
    const approved = pending.get(id);
    pending.delete(id);
    if (!approved || approved.public.expiresAt < now()) throw new InstallerError('INVALID_PLAN', 'Plan expired or already used.');
    executing = true;
    const { receipt } = approved;
    const created = [];
    let installed = false;
    try {
      const saved = await state();
      if (saved.raw !== approved.raw) throw new InstallerError('CONFLICT', 'Receipts changed. Create a new plan.');
      const current = await activations(receipt);
      if (JSON.stringify(current) !== JSON.stringify(approved.current)) throw new InstallerError('CONFLICT', 'Activations changed. Create a new plan.');
      if (approved.public.action !== 'install') {
        await checkStore(receipt);
        if (approved.public.action === 'uninstall') {
          const quarantine = receipt.storePath + '.remove-' + randomUUID();
          await rename(receipt.storePath, quarantine);
          const removed = [];
          try {
            for (const agent of activationKeys(receipt)) if (current[agent].enabled) {
              await unlink(current[agent].path);
              removed.push(current[agent].path);
            }
            await save(saved.receipts.filter(item => item.id !== receipt.id));
          } catch (error) {
            await rename(quarantine, receipt.storePath);
            for (const target of removed) await createActivation(receipt, target);
            throw error;
          }
          await removeStore(receipt, quarantine);
          return { ok: true };
        }
        const agent = receipt.kind === 'cli' ? 'cli' : approved.agent;
        const target = current[agent].path;
        const enabled = approved.public.action === 'enable';
        if (enabled !== current[agent].enabled) {
          if (enabled) {
            await createActivation(receipt, target);
          } else await unlink(target);
          try {
            receipt.activations = { ...current, [agent]: { path: target, enabled } };
            await save(saved.receipts.map(item => item.id === receipt.id ? receipt : item));
          } catch (error) {
            if (enabled) await unlink(target);
            else await createActivation(receipt, target);
            throw error;
          }
        }
        return { ok: true };
      }
      await checkStore(receipt, true);
      if (receipt.kind === 'cli') await buildNix(receipt);
      else await checkout(receipt);
      installed = true;
      await activations(receipt);
      for (const agent of activationKeys(receipt)) {
        const target = receipt.activations[agent].path;
        await createActivation(receipt, target);
        created.push(target);
        receipt.activations[agent].enabled = true;
      }
      await save([...saved.receipts, receipt]);
      return { ok: true };
    } catch (error) {
      for (const target of created) {
        const info = await optionalStat(target);
        if (info && await ownsActivation(receipt, target, info)) await unlink(target);
      }
      if (installed) await removeStore(receipt);
      throw error;
    } finally { executing = false; }
  }

  return { snapshot, plan, execute, search: github.search, inspect: github.inspect, detect,
    refreshDetection: async card => freshDetection(card.detection) ? card : { ...card, ...await github.detect(card.githubUrl, card.tags) },
  };
}
