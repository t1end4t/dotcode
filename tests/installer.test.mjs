import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, readlink, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createInstaller } from '../backend/installer.mjs';

const githubUrl = 'https://github.com/example/skills';
const commit = 'a'.repeat(40);
async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'dotcode-installer-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'data');
  const home = path.join(root, 'home');
  const calls = [];
  const run = async (program, args, { cwd }) => {
    if (program === 'gh') return { stdout: '' };
    calls.push([program, args]);
    if (args.includes('checkout')) {
      await mkdir(path.join(cwd, 'skills/review'), { recursive: true });
      await writeFile(path.join(cwd, 'skills/review/SKILL.md'), '# Review');
      await writeFile(path.join(cwd, 'unrelated.txt'), 'must not be installed');
    }
    return { stdout: args.includes('rev-parse') ? `${commit}\n` : '' };
  };
  const fetchRemote = async url => new Response(JSON.stringify(url.includes('/commits/')
    ? { sha: commit }
    : { tree: [{ path: 'skills/review/SKILL.md', type: 'blob', mode: '100644' }] }));
  const installer = createInstaller({ directory, home, run, fetchRemote, ...options });
  const install = async () => installer.execute((await installer.plan({ action: 'install', githubUrl, subpath: 'skills/review' })).id);
  return { root, directory, home, calls, installer, install };
}

test('installing a subdirectory pins a Store version and activates it for both agents', async t => {
  const { installer, directory, home, calls } = await fixture(t);
  const plan = await installer.plan({ action: 'install', githubUrl, subpath: 'skills/review' });
  assert.equal(calls.length, 0);
  await assert.rejects(readdir(directory), { code: 'ENOENT' });
  await installer.execute(plan.id);
  const { receipts } = await installer.snapshot();
  assert.equal(receipts.length, 1);
  const receipt = receipts[0];
  assert.equal(receipt.version, commit);
  assert.equal(receipt.recipe.backend, 'files');
  assert.equal(receipt.recipe.source.subpath, 'skills/review');
  assert.equal(receipt.status, 'enabled');
  assert.deepEqual(await readdir(receipt.storePath), ['SKILL.md']);
  assert.equal(await readFile(path.join(receipt.storePath, 'SKILL.md'), 'utf8'), '# Review');
  for (const agent of ['codex', 'claude']) {
    assert.equal(receipt.activations[agent].enabled, true);
    assert.equal(await readlink(receipt.activations[agent].path), receipt.storePath);
    assert.ok(receipt.activations[agent].path.startsWith(home + path.sep));
  }
  assert.equal(JSON.parse(await readFile(path.join(directory, 'receipts.json'), 'utf8')).receipts.length, 1);
  await assert.rejects(installer.execute(plan.id), /used|expired/);
});

test('Activation toggles preserve Store and the other agent and never download again', async t => {
  const { installer, install, calls } = await fixture(t);
  await install();
  const [receipt] = (await installer.snapshot()).receipts;
  const downloads = calls.length;
  const action = (action, agent) => installer.plan({ action, componentId: receipt.id, agent }).then(plan => installer.execute(plan.id));
  await action('disable', 'codex');
  let current = (await installer.snapshot()).receipts[0];
  assert.equal(current.activations.codex.enabled, false);
  assert.equal(current.activations.claude.enabled, true);
  assert.equal(current.status, 'enabled');
  assert.equal(await readFile(path.join(receipt.storePath, 'SKILL.md'), 'utf8'), '# Review');
  await action('disable', 'claude');
  assert.equal((await installer.snapshot()).receipts[0].status, 'disabled');
  await action('enable', 'codex');
  current = (await installer.snapshot()).receipts[0];
  assert.equal(current.status, 'enabled');
  assert.equal(current.activations.codex.enabled, true);
  assert.equal(current.activations.claude.enabled, false);
  assert.equal(calls.length, downloads);
});

test('uninstall removes all Activations, Store and Receipt but preserves the Card and old inventory', async t => {
  const { installer, install, directory } = await fixture(t);
  await install();
  const [receipt] = (await installer.snapshot()).receipts;
  await writeFile(path.join(directory, 'catalog.json'), '[{"id":"keep-card"}]');
  await writeFile(path.join(directory, 'inventory.json'), '{"installations":[]}');
  const plan = await installer.plan({ action: 'uninstall', componentId: receipt.id });
  await installer.execute(plan.id);
  assert.deepEqual((await installer.snapshot()).receipts, []);
  for (const target of [receipt.storePath, ...Object.values(receipt.activations).map(entry => entry.path), path.join(directory, 'receipts.json')]) {
    await assert.rejects(readFile(target), { code: 'ENOENT' });
  }
  assert.equal(await readFile(path.join(directory, 'catalog.json'), 'utf8'), '[{"id":"keep-card"}]');
  assert.equal(await readFile(path.join(directory, 'inventory.json'), 'utf8'), '{"installations":[]}');
  await assert.rejects(installer.execute(plan.id), /used|expired/);
});


test('foreign Activation paths reject the entire action without changing any files', async t => {
  for (const replacement of ['directory', 'file', 'symlink']) {
    for (const action of ['enable', 'disable', 'uninstall']) {
      const { installer, install, directory, root } = await fixture(t);
      await install();
      const [receipt] = (await installer.snapshot()).receipts;
      const original = await readFile(path.join(directory, 'receipts.json'), 'utf8');
      const target = receipt.activations.claude.path;
      await rm(target);
      if (replacement === 'directory') {
        await mkdir(target);
        await writeFile(path.join(target, 'keep'), 'foreign');
      } else if (replacement === 'file') await writeFile(target, 'foreign');
      else await symlink(path.join(root, 'foreign'), target);
      await assert.rejects(installer.plan({ action, componentId: receipt.id, agent: 'codex' }), { code: 'CONFLICT' });
      assert.equal(await readFile(path.join(directory, 'receipts.json'), 'utf8'), original);
      assert.equal(await readlink(receipt.activations.codex.path), receipt.storePath);
      assert.equal(await readFile(path.join(receipt.storePath, 'SKILL.md'), 'utf8'), '# Review');
      assert.equal((await installer.snapshot()).receipts[0].status, 'conflict');
      if (replacement === 'directory') assert.equal(await readFile(path.join(target, 'keep'), 'utf8'), 'foreign');
    }
  }
});

test('occupied install names and symlinked Activation parents are conflicts before any writes', async t => {
  for (const symlinkedParent of [false, true]) {
    const { installer, directory, home, root, calls } = await fixture(t);
    const skills = path.join(home, '.claude/skills');
    if (symlinkedParent) {
      await mkdir(path.dirname(skills), { recursive: true });
      await mkdir(path.join(root, 'foreign'));
      await symlink(path.join(root, 'foreign'), skills);
    } else await mkdir(path.join(skills, 'review'), { recursive: true });
    await assert.rejects(installer.plan({ action: 'install', githubUrl, subpath: 'skills/review' }), { code: 'CONFLICT' });
    assert.equal(calls.length, 0);
    await assert.rejects(readdir(directory), { code: 'ENOENT' });
    await assert.rejects(readdir(path.join(home, '.agents')), { code: 'ENOENT' });
  }
});

test('execution rechecks ownership after planning, rejects once, and preserves the other Activation', async t => {
  const { installer, install, directory } = await fixture(t);
  await install();
  const [receipt] = (await installer.snapshot()).receipts;
  const before = await readFile(path.join(directory, 'receipts.json'), 'utf8');
  const plan = await installer.plan({ action: 'uninstall', componentId: receipt.id });
  await rm(receipt.activations.claude.path);
  await mkdir(receipt.activations.claude.path);
  await assert.rejects(installer.execute(plan.id), { code: 'CONFLICT' });
  await assert.rejects(installer.execute(plan.id), { code: 'INVALID_PLAN' });
  assert.equal(await readFile(path.join(directory, 'receipts.json'), 'utf8'), before);
  assert.equal(await readlink(receipt.activations.codex.path), receipt.storePath);
});

test('plans expire and stale Receipts cannot authorize mutations', async t => {
  let clock = 0;
  const { installer, install, directory } = await fixture(t, { now: () => clock });
  const plan = await installer.plan({ action: 'install', githubUrl, subpath: 'skills/review' });
  clock = 16 * 60 * 1000;
  await assert.rejects(installer.execute(plan.id), { code: 'INVALID_PLAN' });
  await install();
  const [receipt] = (await installer.snapshot()).receipts;
  const stale = await installer.plan({ action: 'uninstall', componentId: receipt.id });
  await writeFile(path.join(directory, 'receipts.json'), await readFile(path.join(directory, 'receipts.json'), 'utf8') + ' ');
  await assert.rejects(installer.execute(stale.id), { code: 'CONFLICT' });
  assert.equal(await readlink(receipt.activations.codex.path), receipt.storePath);
});

test('invalid sources, incomplete trees and failed checkout leave nothing installed', async t => {
  const { installer } = await fixture(t);
  for (const value of [{ githubUrl: 'file:///tmp/repo' }, { githubUrl, subpath: '../escape' }, { githubUrl, subpath: '/absolute' }, { githubUrl, subpath: 'x/../../escape' }]) {
    await assert.rejects(installer.plan({ action: 'install', ...value }), { code: 'INVALID_INPUT' });
  }
  const broken = await fixture(t, { run: async () => { throw new Error('git failed'); } });
  await assert.rejects(broken.install(), /git failed/);
  assert.deepEqual((await broken.installer.snapshot()).receipts, []);
  await assert.rejects(readdir(path.join(broken.home, '.agents')), { code: 'ENOENT' });
  const incomplete = await fixture(t, { fetchRemote: async url => new Response(JSON.stringify(url.includes('/commits/') ? { sha: commit } : { tree: [], truncated: true })) });
  await assert.rejects(incomplete.installer.plan({ action: 'install', githubUrl }), /incomplete/);
});


test('real Git sparse checkout materializes only the pinned skill directory', async t => {
  const origin = await mkdtemp(path.join(tmpdir(), 'dotcode-skill-origin-'));
  t.after(() => rm(origin, { recursive: true, force: true }));
  const command = promisify(execFile);
  const git = args => command('git', args, { cwd: origin });
  await git(['init']);
  await mkdir(path.join(origin, 'skills/review'), { recursive: true });
  await writeFile(path.join(origin, 'skills/review/SKILL.md'), '# Real skill');
  await writeFile(path.join(origin, 'unrelated.txt'), 'exclude this');
  await git(['add', '.']);
  await git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'Skill fixture']);
  const sha = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  const { installer, install } = await fixture(t, {
    fetchRemote: async url => new Response(JSON.stringify(url.includes('/commits/') ? { sha } : { tree: [{ path: 'skills/review/SKILL.md', type: 'blob', mode: '100644' }] })),
    run: (program, args, options) => program === 'gh' ? Promise.resolve({ stdout: '' }) : command(program, args.includes('remote') ? [...args.slice(0, -1), origin] : args, options),
  });
  await install();
  const [receipt] = (await installer.snapshot()).receipts;
  assert.equal(receipt.version, sha);
  assert.deepEqual(await readdir(receipt.storePath), ['SKILL.md']);
  assert.equal(await readFile(path.join(receipt.storePath, 'SKILL.md'), 'utf8'), '# Real skill');
});

test('changing the returned plan cannot change the server-side action', async t => {
  const { installer, install } = await fixture(t);
  await install();
  const [receipt] = (await installer.snapshot()).receipts;
  const plan = await installer.plan({ action: 'disable', componentId: receipt.id, agent: 'codex' });
  plan.action = 'uninstall';
  await installer.execute(plan.id);
  const [current] = (await installer.snapshot()).receipts;
  assert.equal(current.activations.codex.enabled, false);
  assert.equal(current.activations.claude.enabled, true);
  assert.equal(await readFile(path.join(current.storePath, 'SKILL.md'), 'utf8'), '# Review');
});

test('Detector uses GitHub CLI credentials when GITHUB_TOKEN is absent, without persisting them', async t => {
  const previous = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  t.after(() => { if (previous === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = previous; });
  const authorization = [];
  const { installer } = await fixture(t, {
    run: async (program, args) => {
      assert.equal(program, 'gh');
      assert.deepEqual(args, ['auth', 'token', '--hostname', 'github.com']);
      return { stdout: 'private-test-token\n' };
    },
    fetchRemote: async (url, options) => {
      authorization.push(options.headers.authorization);
      return new Response(JSON.stringify(url.includes('/commits/') ? { sha: commit } : { tree: [{ path: 'SKILL.md', type: 'blob', mode: '100644' }] }));
    },
  });
  const plan = await installer.plan({ action: 'install', githubUrl });
  assert.deepEqual(authorization, ['Bearer private-test-token', 'Bearer private-test-token']);
  assert.ok(!JSON.stringify(plan).includes('private-test-token'));
  assert.ok(!JSON.stringify(await installer.snapshot()).includes('private-test-token'));
});
