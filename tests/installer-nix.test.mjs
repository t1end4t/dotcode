import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { createInstaller } from '../installer.mjs';

const githubUrl = 'https://github.com/example/hello';
const commit = 'a'.repeat(40);
const nixpkgsRevision = 'b'.repeat(40);

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "dotcode-nix-'"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const directory = path.join(root, 'data');
  const output = path.join(root, 'nix-store/hello-1.0');
  const calls = [];
  const run = async (program, args) => {
    calls.push([program, args]);
    if (program === 'gh') return { stdout: '' };
    assert.equal(program, 'nix');
    if (args[0] === 'search') {
      if (options.searchError) throw new Error('nixpkgs unavailable');
      return { stdout: JSON.stringify({ 'legacyPackages.x86_64-linux.hello': { pname: 'hello', version: '1.0' } }) };
    }
    if (args[0] === 'flake') return { stdout: JSON.stringify({ locked: { type: 'github', owner: 'NixOS', repo: 'nixpkgs', rev: nixpkgsRevision } }) };
    if (args[0] === 'eval') {
      if (options.metadataError && args.some(arg => arg.startsWith('nixpkgs#'))) throw new Error('package evaluation failed');
      return { stdout: JSON.stringify({ homepage: githubUrl, mainProgram: 'hello', pname: 'hello', outputName: options.outputName ?? 'out', outputPath: output, ...options.metadata }) };
    }
    if (args[0] === 'build') {
      await mkdir(path.join(output, 'bin'), { recursive: true });
      await writeFile(path.join(output, 'bin/hello'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 });
      const suffix = options.outputName && options.outputName !== 'out' ? `-${options.outputName}` : '';
      const outLink = args[args.indexOf('--out-link') + 1] + suffix;
      await symlink(output, outLink);
      await options.afterBuild?.({ output, outLink, home });
      return { stdout: '' };
    }
    throw new Error(`Unexpected command: ${program} ${args}`);
  };
  const fetchRemote = async url => new Response(JSON.stringify(url.includes('/commits/')
    ? { sha: commit }
    : { tree: options.flake === false ? [] : [{ path: 'flake.nix', type: 'blob', mode: '100644' }] }));
  const installer = createInstaller({ directory, home, run, fetchRemote, searchPath: path.join(home, '.local/bin'), ...options });
  const install = async (type = 'flake') => {
    const { candidates } = await installer.detect({ githubUrl });
    const recipe = candidates.find(candidate => candidate.recipe.source.type === type).recipe;
    return installer.execute((await installer.plan({ action: 'install', githubUrl, recipe })).id);
  };
  return { root, home, directory, output, calls, installer, install };
}

test('Detector ranks repository flakes before matching nixpkgs packages and explains both on NixOS', async t => {
  const { installer, directory } = await fixture(t);
  const { candidates } = await installer.detect({ githubUrl });
  assert.deepEqual(candidates.map(candidate => [candidate.kind, candidate.recipe.backend, candidate.recipe.source.type]), [
    ['cli', 'nix', 'flake'], ['cli', 'nix', 'nixpkgs'],
  ]);
  assert.match(candidates[0].reason, /flake.*NixOS/i);
  assert.match(candidates[1].reason, /nixpkgs.*NixOS/i);
  assert.equal(candidates[1].recipe.source.attribute, 'hello');
  await assert.rejects(readdir(directory), { code: 'ENOENT' });
  const withoutFlake = await fixture(t, { flake: false });
  assert.deepEqual((await withoutFlake.installer.detect({ githubUrl })).candidates.map(candidate => candidate.recipe.source.type), ['nixpkgs']);
});

test('Detector matches package source URLs and rejects unrelated packages with the same name', async t => {
  const related = await fixture(t, { flake: false, metadata: { homepage: 'https://hello.example', sourceUrl: githubUrl + '/archive/v1.tar.gz' } });
  assert.equal((await related.installer.detect({ githubUrl })).candidates.length, 1);
  const unrelated = await fixture(t, { flake: false, metadata: { homepage: githubUrl + '-other' } });
  assert.deepEqual((await unrelated.installer.detect({ githubUrl })).candidates, []);
});

test('flake candidates remain installable when nixpkgs search or a package evaluation fails', async t => {
  for (const options of [{ searchError: true }, { metadataError: true }]) {
    const { installer, install } = await fixture(t, options);
    const { candidates, warnings } = await installer.detect({ githubUrl });
    assert.deepEqual(candidates.map(candidate => candidate.recipe.source.type), ['flake']);
    assert.match(warnings[0], /nixpkgs|package evaluation/);
    await install();
    assert.equal((await installer.snapshot()).receipts[0].status, 'enabled');
  }
});

test('install pins a flake commit, roots its output in Store and creates a working owned wrapper and Receipt', async t => {
  const { installer, install, directory, home, calls, output } = await fixture(t);
  await install();
  const [receipt] = (await installer.snapshot()).receipts;
  assert.equal(receipt.kind, 'cli');
  assert.equal(receipt.recipe.backend, 'nix');
  assert.equal(receipt.version, commit);
  assert.equal(receipt.status, 'enabled');
  assert.ok(receipt.storePath.startsWith(path.join(directory, 'store/nix') + path.sep));
  assert.equal(await readlink(receipt.storePath), output);
  const wrapper = receipt.activations.cli.path;
  assert.equal(wrapper, path.join(home, '.local/bin/hello'));
  assert.match(await readFile(wrapper, 'utf8'), /^#!\/bin\/sh\n# managed-by: dotcode\n/m);
  const result = await promisify(execFile)(wrapper, ['one argument', '*', "it's safe"]);
  assert.equal(result.stdout, "one argument\n*\nit's safe\n");
  assert.equal(receipt.needsPath, false);
  const build = calls.find(([program, args]) => program === 'nix' && args[0] === 'build')[1];
  assert.ok(build.includes(`github:example/hello/${commit}#^out`));
  assert.equal(build[build.indexOf('--out-link') + 1], receipt.storePath);
  assert.equal(JSON.parse(await readFile(path.join(directory, 'receipts.json'), 'utf8')).receipts[0].version, commit);
});

test('CLI enable and disable only change the wrapper; uninstall removes the out-link and Receipt', async t => {
  const { installer, install, calls, directory, output } = await fixture(t);
  await install();
  const [receipt] = (await installer.snapshot()).receipts;
  const wrapper = receipt.activations.cli.path;
  const commands = calls.length;
  const action = async action => installer.execute((await installer.plan({ action, componentId: receipt.id })).id);
  await action('disable');
  assert.equal((await installer.snapshot()).receipts[0].status, 'disabled');
  await assert.rejects(readFile(wrapper), { code: 'ENOENT' });
  assert.equal(await readlink(receipt.storePath), output);
  await action('enable');
  assert.equal((await installer.snapshot()).receipts[0].status, 'enabled');
  assert.match(await readFile(wrapper, 'utf8'), /managed-by: dotcode/);
  assert.equal(calls.length, commands);
  await action('uninstall');
  assert.deepEqual((await installer.snapshot()).receipts, []);
  for (const target of [wrapper, receipt.storePath, path.join(directory, 'receipts.json')]) await assert.rejects(readFile(target), { code: 'ENOENT' });
  assert.match(await readFile(path.join(output, 'bin/hello'), 'utf8'), /printf/);
});

test('fallback wrapper directory and PATH guidance survive restart without moving existing Activations', async t => {
  const { installer, install, directory, home } = await fixture(t, { searchPath: '/usr/bin' });
  await install();
  const [receipt] = (await installer.snapshot()).receipts;
  assert.equal(receipt.activations.cli.path, path.join(home, '.dotcode/bin/hello'));
  assert.equal(receipt.needsPath, true);
  const restarted = createInstaller({ directory, home, searchPath: `${path.join(home, '.local/bin')}:${path.join(home, '.dotcode/bin')}` });
  const [current] = (await restarted.snapshot()).receipts;
  assert.equal(current.activations.cli.path, receipt.activations.cli.path);
  assert.equal(current.needsPath, false);
  await restarted.execute((await restarted.plan({ action: 'disable', componentId: receipt.id })).id);
  await restarted.execute((await restarted.plan({ action: 'enable', componentId: receipt.id })).id);
  assert.match(await readFile(receipt.activations.cli.path, 'utf8'), /managed-by: dotcode/);
});

test('nixpkgs install pins its revision and all external commands stay within the Nix and GitHub boundaries', async t => {
  const { installer, install, calls } = await fixture(t, { flake: false });
  await install('nixpkgs');
  const [receipt] = (await installer.snapshot()).receipts;
  assert.equal(receipt.version, nixpkgsRevision);
  assert.equal(receipt.recipe.source.type, 'nixpkgs');
  const builds = calls.filter(([, args]) => args[0] === 'build');
  assert.equal(builds.length, 1);
  assert.ok(builds[0][1].includes(`github:NixOS/nixpkgs/${nixpkgsRevision}#hello^out`));
  for (const [program, args] of calls) {
    assert.ok(['nix', 'gh'].includes(program));
    assert.ok(!args.some(arg => /sudo|configuration\.nix|home-manager|nix-store|--add-root|profile/.test(arg)));
  }
});

test('packages with a separate bin output build and remove exactly that output link', async t => {
  const { installer, install, calls, directory, output } = await fixture(t, { outputName: 'bin' });
  await install();
  const [receipt] = (await installer.snapshot()).receipts;
  assert.equal(await readlink(receipt.storePath), output);
  const build = calls.find(([, args]) => args[0] === 'build')[1];
  assert.ok(build.includes(`github:example/hello/${commit}#^bin`));
  await installer.execute((await installer.plan({ action: 'uninstall', componentId: receipt.id })).id);
  assert.deepEqual(await readdir(path.join(directory, 'store/nix', receipt.id)), []);
});

test('occupied wrapper names and symlinked parent folders are conflicts before writes or builds', async t => {
  for (const replacement of ['file', 'directory', 'symlink', 'parent']) {
    const { installer, home, root, directory, calls } = await fixture(t);
    const bin = path.join(home, '.local/bin');
    await mkdir(replacement === 'parent' ? path.dirname(bin) : bin, { recursive: true });
    const target = path.join(bin, 'hello');
    if (replacement === 'file') await writeFile(target, 'user file');
    if (replacement === 'directory') await mkdir(target);
    if (replacement === 'symlink') await symlink(path.join(root, 'missing'), target);
    if (replacement === 'parent') await symlink(root, bin);
    const { candidates } = await installer.detect({ githubUrl });
    await assert.rejects(installer.plan({ action: 'install', githubUrl, recipe: candidates[0].recipe }), { code: 'CONFLICT' });
    assert.ok(!calls.some(([, args]) => args[0] === 'build'));
    await assert.rejects(readdir(directory), { code: 'ENOENT' });
    if (replacement === 'file') assert.equal(await readFile(target, 'utf8'), 'user file');
  }
});

test('replaced wrappers and out-links block mutations while preserving Receipts and foreign paths', async t => {
  for (const replacement of ['file', 'directory', 'symlink', 'out-link']) {
    const { installer, install, directory, root, output } = await fixture(t);
    await install();
    const [receipt] = (await installer.snapshot()).receipts;
    const before = await readFile(path.join(directory, 'receipts.json'), 'utf8');
    const target = replacement === 'out-link' ? receipt.storePath : receipt.activations.cli.path;
    await rm(target);
    if (replacement === 'file') await writeFile(target, '#!/bin/sh\n# managed-by: dotcode\n# someone else\n');
    else if (replacement === 'directory') { await mkdir(target); await writeFile(path.join(target, 'keep'), 'user data'); }
    else await symlink(root, target);
    for (const action of ['enable', 'disable', 'uninstall']) await assert.rejects(installer.plan({ action, componentId: receipt.id }), { code: 'CONFLICT' });
    assert.equal((await installer.snapshot()).receipts[0].status, 'conflict');
    assert.equal(await readFile(path.join(directory, 'receipts.json'), 'utf8'), before);
    assert.match(await readFile(path.join(output, 'bin/hello'), 'utf8'), /printf/);
    if (replacement === 'directory') assert.equal(await readFile(path.join(target, 'keep'), 'utf8'), 'user data');
  }
});

test('wrapper conflicts introduced after planning consume the plan and do not start a build', async t => {
  const { installer, home, directory, calls } = await fixture(t);
  const { candidates } = await installer.detect({ githubUrl });
  const plan = await installer.plan({ action: 'install', githubUrl, recipe: candidates[0].recipe });
  await mkdir(path.join(home, '.local/bin'), { recursive: true });
  await writeFile(path.join(home, '.local/bin/hello'), 'late user file');
  await assert.rejects(installer.execute(plan.id), { code: 'CONFLICT' });
  await assert.rejects(installer.execute(plan.id), { code: 'INVALID_PLAN' });
  assert.ok(!calls.some(([, args]) => args[0] === 'build'));
  await assert.rejects(readdir(directory), { code: 'ENOENT' });
});

test('failed builds, missing binaries and conflicts during build leave no Receipt, wrapper or out-link', async t => {
  for (const failure of ['build', 'binary', 'wrapper']) {
    const { installer, install, home, directory } = await fixture(t, {
      afterBuild: async ({ output, home }) => {
        if (failure === 'build') throw new Error('build failed');
        if (failure === 'binary') await rm(path.join(output, 'bin/hello'));
        if (failure === 'wrapper') { await mkdir(path.join(home, '.local/bin'), { recursive: true }); await writeFile(path.join(home, '.local/bin/hello'), 'user file'); }
      },
    });
    await assert.rejects(install());
    assert.deepEqual((await installer.snapshot()).receipts, []);
    await assert.rejects(readFile(path.join(directory, 'receipts.json')), { code: 'ENOENT' });
    const components = await readdir(path.join(directory, 'store/nix'));
    for (const id of components) assert.deepEqual(await readdir(path.join(directory, 'store/nix', id)), []);
    if (failure === 'wrapper') assert.equal(await readFile(path.join(home, '.local/bin/hello'), 'utf8'), 'user file');
    else await assert.rejects(readFile(path.join(home, '.local/bin/hello')), { code: 'ENOENT' });
  }
});

test('failed builds preserve a foreign symlink substituted for the expected out-link', async t => {
  let target;
  const { installer, install, home } = await fixture(t, {
    afterBuild: async ({ outLink, home }) => {
      target = outLink;
      await rm(outLink);
      await symlink(home, outLink);
      throw new Error('build failed');
    },
  });
  await assert.rejects(install(), { code: 'CONFLICT' });
  assert.equal(await readlink(target), home);
  assert.deepEqual((await installer.snapshot()).receipts, []);
});
