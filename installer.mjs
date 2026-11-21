import { createGithub } from './github.mjs';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
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

export function createInstaller({ directory, home = homedir(), run = promisify(execFile), fetchRemote = globalThis.fetch, now = Date.now, env = process.env } = {}) {
  home = path.resolve(home);
  directory = path.resolve(directory ?? process.env.DOTCODE_HOME ?? path.join(home, '.dotcode'));
  const contains = (root, target) => target === root || target.startsWith(root + path.sep);
  const appDirectory = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');
  if (directory === home || directory === path.parse(directory).root || [appDirectory, path.join(home, 'nix-dev/nixos-conf')].some(root => contains(root, directory) || contains(directory, root))) throw new Error('Installer data must be separate from source, home and NixOS configuration.');
  const receiptFile = path.join(directory, 'receipts.json');
  const pending = new Map();
  let executing = false;
  const github = createGithub({ fetchRemote, run, now, env });
  const componentId = value => createHash('sha256').update(`${value.githubUrl}\n${value.subpath}`).digest('hex').slice(0, 24);
  const storePath = (id, version) => path.join(directory, 'store/skills', id, version);
  const activationPath = (agent, name) => path.join(home, agent === 'codex' ? '.agents' : '.claude', 'skills', name);

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
      const recipeSource = source(receipt?.recipe?.source);
      if (receipt.kind !== 'skill' || receipt.recipe.backend !== 'files' || receipt.id !== componentId(recipeSource) || ids.has(receipt.id) || !/^[\da-f]{40}$/.test(receipt.version) || !/^[\w.-]{1,100}$/.test(receipt.name) || ['.', '..'].includes(receipt.name) || receipt.storePath !== storePath(receipt.id, receipt.version) || !agentNames.every(agent => receipt.activations?.[agent]?.path === activationPath(agent, receipt.name))) throw new Error('Invalid stored Receipt. File unchanged.');
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
    for (const agent of agentNames) {
      const target = activationPath(agent, receipt.name);
      await checkParents(target);
      const info = await optionalStat(target);
      if (info && (!info.isSymbolicLink() || path.resolve(path.dirname(target), await readlink(target)) !== receipt.storePath)) conflict(target);
      result[agent] = { path: target, enabled: Boolean(info) };
    }
    return result;
  }

  async function snapshot() {
    const saved = await state();
    return { receipts: await Promise.all(saved.receipts.map(async receipt => {
      // A Receipt records history; lstat establishes current Activation ownership.
      try {
        await checkStore(receipt);
        const current = await activations(receipt);
        return { ...receipt, activations: current, status: agentNames.some(agent => current[agent].enabled) ? 'enabled' : 'disabled' };
      } catch (error) { return { ...receipt, activations: Object.fromEntries(agentNames.map(agent => [agent, { path: activationPath(agent, receipt.name), enabled: false }])), status: 'conflict', error: error.message }; }
    })) };
  }


  const freshDetection = detection => detection && !detection.error && now() - Date.parse(detection.checkedAt) >= 0 && now() - Date.parse(detection.checkedAt) <= 24 * 60 * 60 * 1000;

  async function detect(value, detection) {
    if (value.ref === 'HEAD' && freshDetection(detection)) {
      if (!detection.skillPaths.includes(value.subpath)) throw new InstallerError('NOT_SKILL', 'No SKILL.md or skill.md in that directory.');
      return detection.commit;
    }
    const repo = value.githubUrl.slice('https://github.com/'.length);
    const revision = await github.request(`/repos/${repo}/commits/${encodeURIComponent(value.ref)}`);
    if (!/^[\da-f]{40}$/.test(revision.sha)) throw new Error('GitHub returned an invalid commit.');
    const tree = await github.request(`/repos/${repo}/git/trees/${revision.sha}?recursive=1`);
    if (!Array.isArray(tree.tree) || tree.truncated) throw new Error('Cannot detect skills from an incomplete GitHub tree.');
    const marker = value.subpath ? `${value.subpath}/` : '';
    if (!tree.tree.some(entry => [marker + 'SKILL.md', marker + 'skill.md'].includes(entry.path) && entry.type === 'blob' && ['100644', '100755'].includes(entry.mode))) throw new InstallerError('NOT_SKILL', 'No SKILL.md or skill.md in that directory.');
    return revision.sha;
  }

  async function plan(body, detection) {
    if (!body || !['install', 'enable', 'disable', 'uninstall'].includes(body.action)) throw new InstallerError('INVALID_INPUT', 'Invalid installer action.');
    const saved = await state();
    let receipt;
    if (body.action === 'install') {
      const value = source(body);
      const id = componentId(value);
      if (saved.receipts.some(receipt => receipt.id === id)) throw new InstallerError('CONFLICT', 'Component is already installed.');
      const name = value.subpath.split('/').at(-1) || value.githubUrl.split('/').at(-1);
      if (!/^[\w.-]{1,100}$/.test(name)) throw new InstallerError('INVALID_INPUT', 'Skill directory name is too long.');
      const version = await detect(value, detection);
      receipt = { id, name, kind: 'skill', recipe: { backend: 'files', source: value }, version, storePath: storePath(id, version), installedAt: new Date(now()).toISOString(), activations: Object.fromEntries(agentNames.map(agent => [agent, { path: activationPath(agent, name) }])) };
    } else {
      receipt = saved.receipts.find(receipt => receipt.id === body.componentId);
      if (!receipt || (body.action !== 'uninstall' && !agentNames.includes(body.agent))) throw new InstallerError('INVALID_INPUT', 'Choose an installed Component and agent.');
    }
    const current = await activations(receipt);
    await checkStore(receipt, body.action === 'install');
    if (body.action === 'install' && agentNames.some(agent => current[agent].enabled)) conflict(receipt.storePath);
    const approved = { id: randomUUID(), action: body.action, componentId: receipt.id, version: receipt.version, expiresAt: now() + 15 * 60 * 1000 };
    for (const [key, pendingPlan] of pending) if (pendingPlan.public.expiresAt < now()) pending.delete(key);
    pending.set(approved.id, { public: approved, receipt, agent: body.agent, raw: saved.raw, current });
    return { ...approved };
  }

  async function checkStore(receipt, installing = false) {
    await checkParents(receipt.storePath);
    const info = await optionalStat(receipt.storePath);
    if (installing ? info : !info?.isDirectory()) conflict(receipt.storePath);
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
            for (const agent of agentNames) if (current[agent].enabled) {
              await unlink(current[agent].path);
              removed.push(current[agent].path);
            }
            await save(saved.receipts.filter(item => item.id !== receipt.id));
          } catch (error) {
            await rename(quarantine, receipt.storePath);
            for (const target of removed) await symlink(receipt.storePath, target);
            throw error;
          }
          await rm(quarantine, { recursive: true });
          return { ok: true };
        }
        const agent = approved.agent;
        const target = current[agent].path;
        const enabled = approved.public.action === 'enable';
        if (enabled !== current[agent].enabled) {
          if (enabled) {
            await mkdir(path.dirname(target), { recursive: true });
            await symlink(receipt.storePath, target);
          } else await unlink(target);
          try {
            receipt.activations = { ...current, [agent]: { path: target, enabled } };
            await save(saved.receipts.map(item => item.id === receipt.id ? receipt : item));
          } catch (error) {
            if (enabled) await unlink(target);
            else await symlink(receipt.storePath, target);
            throw error;
          }
        }
        return { ok: true };
      }
      await checkStore(receipt, true);
      await checkout(receipt);
      installed = true;
      await activations(receipt);
      for (const agent of agentNames) {
        const target = activationPath(agent, receipt.name);
        await mkdir(path.dirname(target), { recursive: true });
        await symlink(receipt.storePath, target);
        created.push(target);
        receipt.activations[agent].enabled = true;
      }
      await save([...saved.receipts, receipt]);
      return { ok: true };
    } catch (error) {
      for (const target of created) if ((await optionalStat(target))?.isSymbolicLink() && await readlink(target) === receipt.storePath) await unlink(target);
      if (installed) await rm(receipt.storePath, { recursive: true, force: true });
      throw error;
    } finally { executing = false; }
  }

  return { snapshot, plan, execute, search: github.search, inspect: github.inspect, detect: github.detect,
    refreshDetection: async card => freshDetection(card.detection) ? card : { ...card, ...await github.detect(card.githubUrl, card.tags) },
  };
}
