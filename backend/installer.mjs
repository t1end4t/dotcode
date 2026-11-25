import { createGithub, referenceBadge } from './github.mjs';
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
// ponytail: keep the defaults for existing requests; add an explicit Kind when a Backend is shared.
const legacyInstallKinds = new Map([['files', 'skill'], ['nix', 'cli']]);

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
  const appDirectory = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
  if (directory === home || directory === path.parse(directory).root || [appDirectory, path.join(home, 'nix-dev/nixos-conf')].some(root => contains(root, directory) || contains(directory, root))) throw new Error('Installer data must be separate from source, home and NixOS configuration.');
  const receiptFile = path.join(directory, 'receipts.json');
  const pending = new Map();
  let executing = false;
  const componentId = (value, identity) => createHash('sha256').update(`${value.githubUrl}\n${identity}`).digest('hex').slice(0, 24);
  const storeVersionPath = (store, id, version, outputName = 'out') => path.join(directory, store, id, version + (outputName === 'out' ? '' : `-${outputName}`));
  const validName = name => typeof name === 'string' && /^[\w.+-]{1,100}$/.test(name) && !['.', '..'].includes(name);

  async function checkParents(target) {
    let cursor = path.parse(target).root;
    for (const part of path.dirname(target).slice(cursor.length).split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, part);
      const info = await optionalStat(cursor);
      if (info && !info.isDirectory()) conflict(cursor);
    }
  }

  function availableId(receipts, id) {
    if (receipts.some(receipt => receipt.id === id)) throw new InstallerError('CONFLICT', 'Component is already installed.');
    return id;
  }

  function validReceiptIdentity(receipt, expectedId, ids) {
    return receipt.id === expectedId && !ids.has(receipt.id) && /^[\da-f]{40}$/.test(receipt.version) && validName(receipt.name);
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
      const kind = kinds.get(receipt.kind);
      if (!kind || !kind.validReceipt(receipt, value, ids)) throw new Error('Invalid stored Receipt. File unchanged.');
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

  async function activations(receipt, kind) {
    const result = {};
    for (const agent of kind.activationKeys) {
      const target = receipt.activations[agent].path;
      await checkParents(target);
      const info = await optionalStat(target);
      if (info && !await kind.ownsActivation(receipt, target, info)) conflict(target);
      result[agent] = { path: target, enabled: Boolean(info) };
    }
    return result;
  }

  async function snapshot() {
    const saved = await state();
    return { receipts: await Promise.all(saved.receipts.map(async receipt => {
      const kind = kinds.get(receipt.kind);
      // A Receipt records history; lstat establishes current Activation ownership.
      try {
        await checkStore(receipt, kind);
        const current = await activations(receipt, kind);
        return { ...receipt, ...kind.snapshotFields?.(receipt), activations: current, status: kind.activationKeys.some(agent => current[agent].enabled) ? 'enabled' : 'disabled' };
      } catch (error) { return { ...receipt, activations: Object.fromEntries(kind.activationKeys.map(agent => [agent, { path: receipt.activations[agent].path, enabled: false }])), status: 'conflict', error: error.message }; }
    })) };
  }

  const freshDetection = detection => detection && !detection.error && now() - Date.parse(detection.checkedAt) >= 0 && now() - Date.parse(detection.checkedAt) <= 24 * 60 * 60 * 1000;

  async function plan(body, detection) {
    if (!body || !['install', 'enable', 'disable', 'uninstall'].includes(body.action)) throw new InstallerError('INVALID_INPUT', 'Invalid installer action.');
    const saved = await state();
    let receipt, kind, activationKey;
    if (body.action === 'install') {
      const value = source(body);
      const backend = body.recipe ? body.recipe.backend : 'files';
      kind = kinds.get(legacyInstallKinds.get(backend));
      if (!kind) throw new InstallerError('INVALID_INPUT', 'Unsupported Backend.');
      receipt = await kind.planInstall({ value, recipe: body.recipe, detection, receipts: saved.receipts });
    } else {
      receipt = saved.receipts.find(receipt => receipt.id === body.componentId);
      if (receipt) {
        kind = kinds.get(receipt.kind);
        if (body.action !== 'uninstall') activationKey = kind.activationKey(body.agent);
      }
      if (!receipt || (body.action !== 'uninstall' && !activationKey)) throw new InstallerError('INVALID_INPUT', 'Choose an installed Component and agent.');
    }
    const current = await activations(receipt, kind);
    await checkStore(receipt, kind, body.action === 'install');
    if (body.action === 'install' && kind.activationKeys.some(agent => current[agent].enabled)) conflict(receipt.storePath);
    const approved = { id: randomUUID(), action: body.action, componentId: receipt.id, version: receipt.version, expiresAt: now() + 15 * 60 * 1000 };
    for (const [key, pendingPlan] of pending) if (pendingPlan.public.expiresAt < now()) pending.delete(key);
    pending.set(approved.id, { public: approved, receipt, activationKey, raw: saved.raw, current });
    return { ...approved };
  }

  async function checkStore(receipt, kind, installing = false) {
    await checkParents(receipt.storePath);
    const info = await optionalStat(receipt.storePath);
    if (installing ? info : !info || !await kind.ownsStore(receipt, receipt.storePath, info)) conflict(receipt.storePath);
  }

  async function removeStore(receipt, kind, target = receipt.storePath) {
    await checkParents(target);
    const info = await optionalStat(target);
    if (!info) return;
    if (!await kind.ownsStore(receipt, target, info)) conflict(target);
    await kind.removeStore(target);
  }

  async function createActivation(receipt, kind, target) {
    await checkParents(target);
    await mkdir(path.dirname(target), { recursive: true });
    await kind.createActivation(receipt, target);
  }

  async function execute(id) {
    if (executing) throw new InstallerError('BUSY', 'Another installer action is running.');
    const approved = pending.get(id);
    pending.delete(id);
    if (!approved || approved.public.expiresAt < now()) throw new InstallerError('INVALID_PLAN', 'Plan expired or already used.');
    executing = true;
    const { receipt, activationKey } = approved;
    const kind = kinds.get(receipt.kind);
    const created = [];
    let installed = false;
    try {
      const saved = await state();
      if (saved.raw !== approved.raw) throw new InstallerError('CONFLICT', 'Receipts changed. Create a new plan.');
      const current = await activations(receipt, kind);
      if (JSON.stringify(current) !== JSON.stringify(approved.current)) throw new InstallerError('CONFLICT', 'Activations changed. Create a new plan.');
      if (approved.public.action !== 'install') {
        await checkStore(receipt, kind);
        if (approved.public.action === 'uninstall') {
          const quarantine = receipt.storePath + '.remove-' + randomUUID();
          await rename(receipt.storePath, quarantine);
          const removed = [];
          try {
            for (const agent of kind.activationKeys) if (current[agent].enabled) {
              await unlink(current[agent].path);
              removed.push(current[agent].path);
            }
            await save(saved.receipts.filter(item => item.id !== receipt.id));
          } catch (error) {
            await rename(quarantine, receipt.storePath);
            for (const target of removed) await createActivation(receipt, kind, target);
            throw error;
          }
          await removeStore(receipt, kind, quarantine);
          return { ok: true };
        }
        const target = current[activationKey].path;
        const enabled = approved.public.action === 'enable';
        if (enabled !== current[activationKey].enabled) {
          if (enabled) {
            await createActivation(receipt, kind, target);
          } else await unlink(target);
          try {
            receipt.activations = { ...current, [activationKey]: { path: target, enabled } };
            await save(saved.receipts.map(item => item.id === receipt.id ? receipt : item));
          } catch (error) {
            if (enabled) await unlink(target);
            else await createActivation(receipt, kind, target);
            throw error;
          }
        }
        return { ok: true };
      }
      await checkStore(receipt, kind, true);
      await kind.installStore(receipt);
      installed = true;
      await activations(receipt, kind);
      for (const agent of kind.activationKeys) {
        const target = receipt.activations[agent].path;
        await createActivation(receipt, kind, target);
        created.push(target);
        receipt.activations[agent].enabled = true;
      }
      await save([...saved.receipts, receipt]);
      return { ok: true };
    } catch (error) {
      for (const target of created) {
        const info = await optionalStat(target);
        if (info && await kind.ownsActivation(receipt, target, info)) await unlink(target);
      }
      if (installed) await removeStore(receipt, kind);
      throw error;
    } finally { executing = false; }
  }

  const agentNames = ['codex', 'claude'];
  const skillId = value => componentId(value, value.subpath);
  const skillStorePath = (id, version, outputName) => storeVersionPath('store/skills', id, version, outputName);
  const skillActivationPath = (agent, name) => path.join(home, agent === 'codex' ? '.agents' : '.claude', 'skills', name);

  async function detectSkill(value, detection) {
    if (value.ref === 'HEAD' && freshDetection(detection)) {
      if (!detection.skillPaths.includes(value.subpath)) throw new InstallerError('NOT_SKILL', 'No SKILL.md or skill.md in that directory.');
      return detection.commit;
    }
    const { version, tree } = await github.repository(value.githubUrl, value.ref);
    const marker = value.subpath ? `${value.subpath}/` : '';
    if (!tree.some(entry => [marker + 'SKILL.md', marker + 'skill.md'].includes(entry.path) && entry.type === 'blob' && ['100644', '100755'].includes(entry.mode))) throw new InstallerError('NOT_SKILL', 'No SKILL.md or skill.md in that directory.');
    return version;
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
      const skillDirectory = path.join(checkoutDirectory, receipt.recipe.source.subpath);
      await checkParents(path.join(skillDirectory, 'SKILL.md'));
      await checkTree(skillDirectory);
      if (!(await Promise.all(['SKILL.md', 'skill.md'].map(name => optionalStat(path.join(skillDirectory, name))))).some(info => info?.isFile())) throw new Error('Checkout has no skill marker.');
      await checkParents(receipt.storePath);
      if (await optionalStat(receipt.storePath)) conflict(receipt.storePath);
      await mkdir(path.dirname(receipt.storePath), { recursive: true, mode: 0o700 });
      const payload = path.join(temporary, 'payload');
      await cp(skillDirectory, payload, { recursive: true, errorOnExist: true, force: false, filter: target => path.basename(target) !== '.git' });
      await checkStore(receipt, skill, true);
      await rename(payload, receipt.storePath);
    } finally { await rm(temporary, { recursive: true, force: true }); }
  }

  const skill = {
    backend: 'files',
    activationKeys: agentNames,
    activationKey: agent => agentNames.includes(agent) ? agent : undefined,
    validReceipt(receipt, value, ids) {
      const validActivation = agentNames.every(agent => receipt.activations?.[agent]?.path === skillActivationPath(agent, receipt.name));
      return receipt.recipe.backend === skill.backend && validReceiptIdentity(receipt, skillId(value), ids)
        && receipt.storePath === skillStorePath(receipt.id, receipt.version, receipt.outputName) && validActivation;
    },
    async planInstall({ value, detection, receipts }) {
      const id = availableId(receipts, skillId(value));
      const name = value.subpath.split('/').at(-1) || value.githubUrl.split('/').at(-1);
      if (!/^[\w.-]{1,100}$/.test(name)) throw new InstallerError('INVALID_INPUT', 'Skill directory name is too long.');
      const version = await detectSkill(value, detection);
      const activations = Object.fromEntries(agentNames.map(agent => [agent, { path: skillActivationPath(agent, name) }]));
      return { id, name, kind: 'skill', recipe: { backend: skill.backend, source: value }, version, storePath: skillStorePath(id, version), installedAt: new Date(now()).toISOString(), activations };
    },
    installStore: checkout,
    ownsStore: (_receipt, _target, info) => info.isDirectory(),
    removeStore: target => rm(target, { recursive: true }),
    createActivation: (receipt, target) => symlink(receipt.storePath, target),
    ownsActivation: async (receipt, target, info) => info.isSymbolicLink() && path.resolve(path.dirname(target), await readlink(target)) === receipt.storePath,
  };

  const cliId = value => componentId(value, `cli\n${value.type}\n${value.attribute}`);
  const cliStorePath = (id, version, outputName) => storeVersionPath('store/nix', id, version, outputName);
  const onPath = target => searchPath.split(path.delimiter).some(entry => entry && path.resolve(entry) === target);
  const cliDirectory = () => path.join(home, onPath(path.join(home, '.local/bin')) ? '.local/bin' : '.dotcode/bin');
  const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  const wrapper = receipt => `#!/bin/sh\n# managed-by: dotcode\n# component: ${receipt.id}\nexec ${shellQuote(path.join(receipt.storePath, 'bin', receipt.name))} "$@"\n`;

  const nixJSON = async args => JSON.parse((await run('nix', args, { timeout: 120000, maxBuffer: 4 * 1024 * 1024 })).stdout);
  const nixPackage = (reference, flake) => nixJSON(['eval', '--json', reference, '--apply',
    'p: assert (p.type or null) == "derivation"; { mainProgram = p.meta.mainProgram or null; pname = p.pname or null; outputName = (p.bin or p).outputName or "out"; outputPath = (p.bin or p).outPath; }',
    ...(flake ? ['--no-accept-flake-config', '--no-write-lock-file', '--option', 'pure-eval', 'true', '--option', 'allow-import-from-derivation', 'false'] : []),
  ]);
  const github = createGithub({ fetchRemote, run, now, env, probeFlakeCli: async (repo, commit) => {
    const reference = `github:${repo}/${commit}`;
    let metadata;
    try { metadata = await nixPackage(`${reference}#`, true); }
    catch (error) {
      if (error.stderr?.includes(`error: flake '${reference}' does not provide attribute 'packages.`)) return false;
      throw error;
    }
    if (typeof metadata?.outputPath !== 'string' || !path.isAbsolute(metadata.outputPath)) throw new Error('Nix returned an invalid output path.');
    // ponytail: keep ambiguous default packages as candidates; verify the binary after an approved build.
    return validName(metadata.mainProgram) || metadata.outputName === 'bin' ? true : 'candidate';
  } });
  const validAttribute = value => typeof value === 'string' && /^[a-zA-Z_][\w-]*(\.[a-zA-Z_][\w-]*)*$/.test(value);

  function nixSource(value) {
    const normalized = source(value);
    if (normalized.subpath || !['flake', 'nixpkgs'].includes(value.type) || (value.type === 'flake' ? value.attribute !== '' : !validAttribute(value.attribute))) throw new InstallerError('INVALID_INPUT', 'Choose a detected Nix Recipe.');
    return { ...normalized, type: value.type, attribute: value.attribute };
  }

  const installable = receipt => `${receipt.recipe.source.type === 'flake' ? 'github:' + receipt.recipe.source.githubUrl.slice('https://github.com/'.length) : 'github:NixOS/nixpkgs'}/${receipt.version}#${receipt.recipe.source.attribute}`;

  async function detect(body) {
    const value = source(body);
    const { detection: { badges, commit: version, error }, warnings } = await github.detect(value.githubUrl, undefined, value.ref);
    const candidates = [];
    if (!error && referenceBadge(badges)) return { candidates, version, warnings };
    const candidate = (type, attribute, reason) => ({ kind: 'cli', recipe: { backend: 'nix', source: { ...value, type, attribute } }, reason });
    // ponytail: flake detection offers the default package; enumerate variants when selection is supported.
    if (!value.subpath && badges.includes('Nix flake')) {
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

  async function buildNix(receipt) {
    await mkdir(path.dirname(receipt.storePath), { recursive: true, mode: 0o700 });
    try {
      await run('nix', ['build', `${installable(receipt)}^${receipt.outputName}`, '--out-link', cliStorePath(receipt.id, receipt.version)], { timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
      await checkStore(receipt, cli);
      const binary = await stat(path.join(receipt.storePath, 'bin', receipt.name));
      if (!binary.isFile() || !(binary.mode & 0o111)) throw new InstallerError('INVALID_SOURCE', 'Nix output does not contain the executable CLI.');
    } catch (error) {
      await removeStore(receipt, cli);
      throw error;
    }
  }

  const cli = {
    backend: 'nix',
    activationKeys: ['cli'],
    activationKey: () => 'cli',
    validReceipt(receipt, _value, ids) {
      const recipeSource = nixSource(receipt.recipe.source);
      const validActivation = [path.join(home, '.local/bin', receipt.name), path.join(home, '.dotcode/bin', receipt.name)].includes(receipt.activations?.cli?.path);
      return receipt.recipe.backend === cli.backend && receipt.recipe.binary === receipt.name
        && validName(receipt.outputName) && typeof receipt.outputPath === 'string' && path.isAbsolute(receipt.outputPath)
        && validReceiptIdentity(receipt, cliId(recipeSource), ids)
        && receipt.storePath === cliStorePath(receipt.id, receipt.version, receipt.outputName) && validActivation;
    },
    async planInstall({ value, recipe, receipts }) {
      const selected = nixSource(recipe.source);
      if (JSON.stringify(source(selected)) !== JSON.stringify(value)) throw new InstallerError('INVALID_INPUT', 'Recipe must belong to the selected Card.');
      const { candidates, version: repoVersion, warnings } = await detect(value);
      if (!candidates.some(candidate => JSON.stringify(candidate.recipe.source) === JSON.stringify(selected))) {
        if (warnings.length) throw new InstallerError('SOURCE_ERROR', warnings.join('\n'));
        throw new InstallerError('INVALID_INPUT', 'Choose a detected Nix Recipe.');
      }
      const id = availableId(receipts, cliId(selected));
      const version = selected.type === 'flake' ? repoVersion : (await nixJSON(['flake', 'metadata', '--json', 'nixpkgs'])).locked?.rev;
      if (!/^[\da-f]{40}$/.test(version)) throw new InstallerError('SOURCE_ERROR', 'Nix returned an invalid revision.');
      const receipt = { id, kind: 'cli', recipe: { backend: cli.backend, source: selected }, version, storePath: cliStorePath(id, version), installedAt: new Date(now()).toISOString() };
      const metadata = await nixPackage(installable(receipt), selected.type === 'flake');
      const name = metadata.mainProgram ?? metadata.pname ?? value.githubUrl.split('/').at(-1);
      if (!validName(name)) throw new InstallerError('INVALID_SOURCE', 'Nix package has an invalid CLI name.');
      receipt.name = name;
      receipt.outputName = metadata.outputName ?? 'out';
      if (!validName(receipt.outputName)) throw new InstallerError('INVALID_SOURCE', 'Nix package has an invalid output name.');
      receipt.outputPath = metadata.outputPath;
      if (typeof receipt.outputPath !== 'string' || !path.isAbsolute(receipt.outputPath)) throw new InstallerError('INVALID_SOURCE', 'Nix returned an invalid output path.');
      receipt.storePath = cliStorePath(id, version, receipt.outputName);
      receipt.recipe.binary = name;
      receipt.activations = { cli: { path: path.join(cliDirectory(), name) } };
      return receipt;
    },
    installStore: buildNix,
    ownsStore: async (receipt, target, info) => info.isSymbolicLink() && await readlink(target) === receipt.outputPath,
    removeStore: unlink,
    createActivation: (receipt, target) => writeFile(target, wrapper(receipt), { flag: 'wx', mode: 0o755 }),
    ownsActivation: async (receipt, target, info) => info.isFile() && await readFile(target, 'utf8') === wrapper(receipt),
    snapshotFields: receipt => ({ needsPath: !onPath(path.dirname(receipt.activations.cli.path)) }),
  };

  const kinds = new Map([['skill', skill], ['cli', cli]]);
  return { snapshot, plan, execute, search: github.search, inspect: github.inspect, info: github.info, detect,
    refreshDetection: async card => {
      if (freshDetection(card.detection)) return card;
      const { detection, latestReleaseAt } = await github.detect(card.githubUrl);
      if (detection.error) return card;
      return { ...card, detection, ...(latestReleaseAt !== undefined && { latestReleaseAt }) };
    },
  };
}
