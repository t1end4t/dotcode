import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { attachAgent, isLocalRequest, validateResult } from '../agent.mjs';

const url = 'https://github.com/example/tool';

test('inventory discovers CLI-created Nix profiles without executing tools or writing receipts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-discovery-'));
  const profile = path.join(directory, 'workspace', 'apps', 'tool', 'profile');
  const store = path.join(directory, 'store', 'hash-tool-1.2.3');
  const calls = [];
  const app = express().use(express.json());
  attachAgent(app, { directory, createCodex: fakeCodex(calls), listMcpServers: async () => [] });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const catalog = { ...Object.fromEntries(['category', 'categoryLabel', 'description', 'primaryLanguage', 'defaultInstallCommand', 'customNotes', 'customCommand'].map(field => [field, 'Tools'])), id: 'tool', name: 'Tool', repo: 'example/tool', githubUrl: url, tags: [] };
    await writeFile(path.join(directory, 'catalog.json'), JSON.stringify([catalog]));
    const state = JSON.stringify({ installations: [], runs: [], categories: [] });
    await writeFile(path.join(directory, 'inventory.json'), state);
    const inventory = async () => {
      const response = await fetch(`${base}/api/inventory`);
      assert.equal(response.status, 200);
      return (await response.json()).installations;
    };
    await mkdir(profile, { recursive: true });
    assert.deepEqual(await inventory(), []);
    await writeFile(path.join(profile, 'manifest.json'), JSON.stringify({ version: 3, elements: { tool: { active: true, storePaths: [store] } } }));
    assert.deepEqual(await inventory(), []);
    await mkdir(path.join(store, 'bin'), { recursive: true });
    await writeFile(path.join(store, 'bin', 'tool'), '#!/bin/sh\nexit 99\n');
    await symlink(path.join(store, 'bin'), path.join(profile, 'bin'));
    assert.deepEqual(await inventory(), []);
    await chmod(path.join(store, 'bin', 'tool'), 0o755);
    const [receipt] = await inventory();
    assert.equal(receipt.githubUrl, url);
    assert.equal(receipt.installed, true);
    assert.equal('enabled' in receipt, false);
    assert.equal(receipt.version, '1.2.3');
    assert.equal(receipt.verificationCommand, '');
    assert.equal(await readFile(path.join(directory, 'inventory.json'), 'utf8'), state);
    await post(base, { mode: 'plan', message: 'Inspect Tool' });
    assert.match(calls[0].prompt, /Nix profile \(disk discovery\)/);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'inventory.json'), 'utf8')).installations, []);
    await writeFile(path.join(profile, 'manifest.json'), JSON.stringify({ version: 3, elements: {} }));
    assert.deepEqual(await inventory(), []);
    await writeFile(path.join(directory, 'inventory.json'), JSON.stringify({ installations: [receipt], runs: [] }));
    assert.equal((await inventory())[0].installed, false);
    await rm(profile, { recursive: true });
    assert.equal((await inventory())[0].installed, false);
    assert.equal(JSON.parse(await readFile(path.join(directory, 'inventory.json'), 'utf8')).installations[0].installed, true);
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

function fakeCodex(calls, planning = { reply: 'Plan: npm i -g tool', canExecute: true, categories: [{ githubUrl: url, category: 'Developer CLI' }] }, execution) {
  return clientOptions => ({
    startThread(options) {
      return {
        async runStreamed(prompt, turnOptions) {
          calls.push({ options, prompt, turnOptions, clientOptions });
          const execute = turnOptions.outputSchema.required.includes('changes');
          return { events: (async function* () {
            if (execute) yield { type: 'item.completed', item: { id: 'c', type: 'command_execution', command: 'tool --version', aggregated_output: '1.0.0', exit_code: 0, status: 'completed' } };
            yield { type: 'item.completed', item: { id: 'm', type: 'agent_message', text: execute ? execution ?? JSON.stringify({ reply: 'Installed.', changes: [{ name: 'Tool', githubUrl: url, action: 'install', location: '/tmp/tool', method: 'npm', configurationNotes: '', version: '1.0.0', installCommand: 'npm i -g tool', updateCommand: 'npm i -g tool@latest', uninstallCommand: 'npm rm -g tool', verificationCommand: 'tool --version' }] }) : JSON.stringify(planning) } };
            yield { type: 'turn.completed', usage: null };
          })() };
        },
      };
    },
  });
}

async function post(base, body, headers = {}) {
  const response = await fetch(`${base}/api/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return (await response.text()).trim().split('\n').map(line => JSON.parse(line)).at(-1);
}

test('chat creates, edits, and removes persisted cards without changing installation receipts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-chat-catalog-'));
  const item = { id: 'tool', name: 'Tool', repo: 'example/tool', githubUrl: url, category: 'CLI', categoryLabel: 'CLI', description: '', tags: [], primaryLanguage: '', defaultInstallCommand: '', customNotes: '', customCommand: '' };
  const planning = { reply: 'Saved.', canExecute: false, categories: [], catalogChanges: [{ action: 'create', githubUrl: url, item }] };
  const calls = [];
  const app = express().use(express.json());
  attachAgent(app, { directory, listMcpServers: async () => [], createCodex: fakeCodex(calls, planning) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const chat = message => post(base, { mode: 'plan', message });
    const savedCatalog = async () => (await (await fetch(`${base}/api/catalog`)).json()).items;
    const created = await chat('Add example/tool');
    assert.equal(created.type, 'result');
    assert.equal(created.planId, undefined);
    assert.deepEqual(await savedCatalog(), [item]);
    assert.deepEqual(created.installations, []);
    assert.ok(calls[0].turnOptions.outputSchema.required.includes('catalogChanges'));
    assert.equal(calls[0].options.sandboxMode, 'read-only');

    const updated = { ...item, name: 'Renamed', customNotes: 'My notes', tags: ['CLI'] };
    planning.catalogChanges = [{ action: 'update', githubUrl: url, item: updated }];
    await chat('Rename the card and save my notes and tags');
    assert.deepEqual(await savedCatalog(), [updated]);
    assert.ok(calls[1].prompt.includes('My notes') === false);
    planning.catalogChanges = [];
    await chat('Show my notes');
    assert.ok(calls[2].prompt.includes('My notes'));

    const initial = { name: 'Tool', githubUrl: url, installed: true, verifiedAt: '2026-10-20', location: '/tmp/tool', method: 'test' };
    await writeFile(path.join(directory, 'inventory.json'), JSON.stringify({ installations: [initial], runs: [], categories: [{ githubUrl: url, category: 'CLI' }] }));
    planning.catalogChanges = [{ action: 'remove', githubUrl: url, item: null }];
    const removed = await chat('Remove the card, not the installation');
    assert.equal(removed.type, 'result');
    assert.deepEqual(await savedCatalog(), []);
    assert.deepEqual(removed.installations, [initial]);
    assert.deepEqual(removed.categories, []);
    const inventory = JSON.parse(await readFile(path.join(directory, 'inventory.json'), 'utf8'));
    assert.deepEqual(inventory.installations, [initial]);

    const overwrite = await fetch(`${base}/api/catalog`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [item] }) });
    assert.equal(overwrite.status, 409);
    assert.deepEqual(await savedCatalog(), []);
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('invalid chat catalog batches leave every card unchanged', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-chat-invalid-'));
  const item = { id: 'tool', name: 'Tool', repo: 'example/tool', githubUrl: url, category: 'CLI', categoryLabel: 'CLI', description: '', tags: [], primaryLanguage: '', defaultInstallCommand: '', customNotes: 'Keep me', customCommand: '' };
  const planning = { reply: 'Saved.', canExecute: false, categories: [], catalogChanges: [] };
  const app = express().use(express.json());
  attachAgent(app, { directory, listMcpServers: async () => [], createCodex: fakeCodex([], planning) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    await writeFile(path.join(directory, 'catalog.json'), JSON.stringify([item]));
    for (const change of [
      { action: 'update', githubUrl: url, item: { ...item, githubUrl: 'https://evil.example/tool' } },
      { action: 'update', githubUrl: url, item: { ...item, repo: 'example/other' } },
      { action: 'update', githubUrl: url, item: { ...item, id: 'other-id' } },
      { action: 'update', githubUrl: url, item: { ...item, installed: true } },
      { action: 'remove', githubUrl: 'https://github.com/example/missing', item: null },
      { action: 'create', githubUrl: `${url.toUpperCase()}/`, item: { ...item, id: 'duplicate', githubUrl: `${url}/` } },
      { action: 'install', githubUrl: url, item },
    ]) {
      planning.catalogChanges = [change];
      const result = await post(base, { mode: 'plan', message: 'Edit my catalog' });
      assert.equal(result.type, 'error');
      assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'catalog.json'), 'utf8')), [item]);
    }
    planning.catalogChanges = [
      { action: 'update', githubUrl: url, item: { ...item, customNotes: 'Changed' } },
      { action: 'remove', githubUrl: 'https://github.com/example/missing', item: null },
    ];
    assert.equal((await post(base, { mode: 'plan', message: 'Edit both cards' })).type, 'error');
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'catalog.json'), 'utf8')), [item]);
    planning.catalogChanges = [{ action: 'update', githubUrl: url, item: { ...item, customNotes: 'Changed' } }];
    planning.categories = [{ githubUrl: 'https://github.com/example/missing', category: 'Wrong' }];
    assert.equal((await post(base, { mode: 'plan', message: 'Edit my card' })).type, 'error');
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'catalog.json'), 'utf8')), [item]);
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('chat can add a new card while planning an approved install, then verify install, update, uninstall', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-chat-lifecycle-'));
  const item = { id: 'tool', name: 'Tool', repo: 'example/tool', githubUrl: url, category: 'CLI', categoryLabel: 'CLI', description: '', tags: [], primaryLanguage: '', defaultInstallCommand: '', customNotes: '', customCommand: '' };
  const planning = { reply: 'Install plan.', canExecute: true, categories: [], catalogChanges: [{ action: 'create', githubUrl: url, item }] };
  let action = 'install';
  const app = express().use(express.json());
  attachAgent(app, { directory, listMcpServers: async () => [], createCodex: options => fakeCodex([], planning, JSON.stringify({ reply: 'Verified.', changes: [{ name: 'Tool', githubUrl: url, action, location: '/tmp/tool', method: 'test', configurationNotes: '', version: action === 'update' ? '2.0.0' : '1.0.0', installCommand: '', updateCommand: '', uninstallCommand: '', verificationCommand: 'tool --version' }] }))(options) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (action of ['install', 'update', 'uninstall']) {
      const plan = await post(base, { mode: 'plan', message: `${action} example/tool` });
      assert.ok(plan.planId);
      const before = JSON.parse(await readFile(path.join(directory, 'inventory.json'), 'utf8'));
      if (action === 'install') assert.deepEqual(before.installations, []);
      const result = await post(base, { mode: 'execute', planId: plan.planId });
      assert.equal(result.type, 'result');
      assert.equal(result.installations[0].installed, action !== 'uninstall');
      if (action === 'update') assert.equal(result.installations[0].version, '2.0.0');
      assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'catalog.json'), 'utf8')), [item]);
      planning.catalogChanges = [];
    }
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('chat registers an existing external installation only after approval and successful verification', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dotcode-register-'));
  const directory = path.join(root, 'data');
  const location = path.join(root, 'npm-global', 'lib', 'node_modules', 'tool');
  await mkdir(location, { recursive: true });
  const manifest = JSON.stringify({ name: 'tool', version: '1.0.0' });
  await writeFile(path.join(location, 'package.json'), manifest);
  const calls = [];
  const verificationCommand = `cat '${path.join(location, 'package.json')}'`;
  const change = { name: 'Tool', githubUrl: url, action: 'register', location, method: 'global npm (existing)', configurationNotes: 'Package verified; runtime health not checked.', version: '1.0.0', installCommand: '', updateCommand: '', uninstallCommand: '', verificationCommand };
  let verification;
  const app = express().use(express.json());
  attachAgent(app, { directory, listMcpServers: async () => [], createCodex: () => ({ startThread(options) {
    return { async runStreamed(prompt, { outputSchema }) {
      calls.push({ options, prompt, outputSchema });
      const execute = outputSchema.required.includes('changes');
      return { events: (async function* () {
        if (execute && verification) yield { type: 'item.completed', item: verification };
        yield { type: 'item.completed', item: { id: 'm', type: 'agent_message', text: JSON.stringify(execute
          ? { reply: 'Registered existing installation; runtime health not checked.', changes: [change] }
          : { reply: `Verify ${location} read-only, then register it without reinstalling.`, canExecute: true, categories: [], catalogChanges: [] }) } };
        yield { type: 'turn.completed', usage: null };
      })() };
    } };
  } }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const inventory = async () => JSON.parse(await readFile(path.join(directory, 'inventory.json'), 'utf8'));
    for (const status of ['missing', 'failed', 'completed']) {
      verification = status === 'missing' ? undefined : { id: 'c', type: 'command_execution', command: verificationCommand, aggregated_output: manifest, exit_code: status === 'completed' ? 0 : 1, status };
      const plan = await post(base, { mode: 'plan', message: 'Mark my existing global tool as installed. Do not reinstall it.' });
      assert.ok(plan.planId);
      assert.deepEqual((await inventory()).installations, []);
      assert.equal(calls.at(-1).options.sandboxMode, 'read-only');
      assert.match(calls.at(-1).prompt, /action.*register/i);
      const result = await post(base, { mode: 'execute', planId: plan.planId });
      assert.ok(calls.at(-1).outputSchema.properties.changes.items.properties.action.enum.includes('register'));
      if (status !== 'completed') {
        assert.equal(result.type, 'error');
        assert.match(result.message, /verification/);
        assert.deepEqual((await inventory()).installations, []);
      } else {
        assert.equal(result.type, 'result');
        const [receipt] = (await inventory()).installations;
        assert.equal(receipt.action, 'register');
        assert.equal(receipt.installed, true);
        assert.equal(receipt.location, location);
        assert.equal(receipt.version, '1.0.0');
        assert.equal(receipt.installCommand, '');
        assert.equal(receipt.verificationCommand, verificationCommand);
        assert.equal((await fetch(`${base}/api/inventory`).then(response => response.json())).installations[0].installed, true);
      }
      assert.equal(await readFile(path.join(location, 'package.json'), 'utf8'), manifest);
    }
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Codex folder selection preserves the catalog, categories, and inventory while binding approvals to the sandbox', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dotcode-folders-'));
  const directory = path.join(root, 'data');
  const selected = path.join(root, 'project');
  await mkdir(directory);
  await mkdir(selected);
  const calls = [];
  const app = express().use(express.json());
  attachAgent(app, { directory, createCodex: fakeCodex(calls), listMcpServers: async () => [] });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const catalog = [{ ...Object.fromEntries(['description', 'primaryLanguage', 'defaultInstallCommand', 'customNotes', 'customCommand'].map(field => [field, ''])), id: 'tool', name: 'Tool', repo: 'example/tool', githubUrl: url, category: 'Developer Tools', categoryLabel: 'Developer Tools', tags: [] }];
    await writeFile(path.join(directory, 'catalog.json'), JSON.stringify(catalog));
    const headers = { 'x-dotcode-workspace': selected };
    const info = await fetch(`${base}/api/workspace`, { headers });
    assert.equal(info.status, 200);
    assert.deepEqual(await info.json(), { workspace: selected });
    assert.deepEqual((await fetch(`${base}/api/catalog`, { headers }).then(response => response.json())).items, catalog);
    const plan = await post(base, { mode: 'plan', message: `Install ${url}` });
    const wrongFolder = await post(base, { mode: 'execute', planId: plan.planId }, headers);
    assert.match(wrongFolder.error, /folder/i);
    const result = await post(base, { mode: 'execute', planId: plan.planId });
    assert.equal(result.type, 'result');
    const inventory = await fetch(`${base}/api/inventory`).then(response => response.json());
    assert.equal(inventory.installations.length, 1);
    assert.deepEqual(await fetch(`${base}/api/inventory`, { headers }).then(response => response.json()), inventory);
    const selectedPlan = await post(base, { mode: 'plan', message: `Install ${url}` }, headers);
    assert.equal(calls.at(-1).options.workingDirectory, selected);
    assert.equal(calls.at(-1).options.sandboxMode, 'read-only');
    await post(base, { mode: 'execute', planId: selectedPlan.planId }, headers);
    assert.equal(calls.at(-1).options.workingDirectory, selected);
    assert.equal(calls.at(-1).options.sandboxMode, 'workspace-write');
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'catalog.json'), 'utf8')), catalog);
    await assert.rejects(readFile(path.join(selected, 'catalog.json')), { code: 'ENOENT' });
    const alias = path.join(directory, 'source-link');
    await symlink(path.resolve('.'), alias);
    for (const unsafe of ['relative/path', '/', directory, path.resolve('.'), alias, path.join(alias, 'forbidden-target'), '~someone/workspace']) {
      const response = await fetch(`${base}/api/workspace`, { headers: { 'x-dotcode-workspace': unsafe } });
      assert.equal(response.status, 400, unsafe);
    }
    await assert.rejects(readFile(path.join(alias, 'forbidden-target', 'inventory.json')), { code: 'ENOENT' });
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('folder browser lists visible subfolders read-only', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dotcode-browse-'));
  await Promise.all(['b', 'a', '.hidden', 'data'].map(name => mkdir(path.join(root, name))));
  await writeFile(path.join(root, 'file.txt'), '');
  await symlink(path.join(root, 'a'), path.join(root, 'link'));
  const app = express();
  attachAgent(app, { directory: path.join(root, 'data'), listMcpServers: async () => [] });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/folders`;
    const listing = await fetch(`${base}?dir=${encodeURIComponent(root)}`).then(response => response.json());
    assert.deepEqual(listing, { dir: await realpath(root), parent: path.dirname(await realpath(root)), home: homedir(), entries: ['a', 'b', 'data'] });
    for (const bad of ['relative', path.join(root, 'file.txt'), path.join(root, 'missing')]) {
      assert.equal((await fetch(`${base}?dir=${encodeURIComponent(bad)}`)).status, 400, bad);
    }
    assert.equal((await fetch(`${base}?dir=${encodeURIComponent(root)}&dir=/`)).status, 400);
    const linked = await fetch(`${base}?dir=${encodeURIComponent(path.join(root, 'link'))}`).then(response => response.json());
    assert.equal(linked.dir, await realpath(path.join(root, 'a')));
    await assert.rejects(readFile(path.join(root, 'data', 'catalog.json')), { code: 'ENOENT' });
  } finally {
    server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('read-only plan, one-time approval, verified inventory receipt', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-'));
  const calls = [];
  const app = express().use(express.json());
  attachAgent(app, { directory, createCodex: fakeCodex(calls), listMcpServers: async () => ['external'] });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const plan = await post(base, { mode: 'plan', message: `Install ${url}`, catalog: [{ githubUrl: url, name: 'Tool', description: '', category: 'Uncategorized' }] });
    assert.deepEqual(plan.categories, [{ githubUrl: url, category: 'Developer CLI' }]);
    assert.equal(calls[0].options.sandboxMode, 'read-only');
    assert.equal(calls[0].turnOptions.outputSchema.properties.canExecute.type, 'boolean');
    const result = await post(base, { mode: 'execute', planId: plan.planId });
    assert.equal(result.installations[0].installed, true);
    assert.equal(calls[1].options.sandboxMode, 'workspace-write');
    assert.equal(calls[1].options.workingDirectory, await realpath(path.join(directory, 'workspace')));
    for (const call of calls) {
      assert.equal(call.options.approvalPolicy, 'never');
      assert.deepEqual(call.clientOptions.config.mcp_servers, { external: { enabled: false } });
      assert.deepEqual(call.clientOptions.config.sandbox_workspace_write, { writable_roots: [], exclude_tmpdir_env_var: true, exclude_slash_tmp: true });
    }
    assert.match(calls[1].prompt, /explicitly approved/);
    const saved = JSON.parse(await readFile(path.join(directory, 'inventory.json'), 'utf8'));
    assert.equal(saved.installations[0].verificationCommand, 'tool --version');
    assert.equal('enabled' in saved.installations[0], false);
    assert.deepEqual(saved.categories, [{ githubUrl: url, category: 'Developer CLI' }]);
    assert.equal(saved.runs[1].status, 'completed');
    assert.equal(saved.runs[1].events[0].item.command, 'tool --version');
    const inventory = await (await fetch(`${base}/api/inventory`)).json();
    assert.deepEqual(inventory.installations, saved.installations);
    const reused = await fetch(`${base}/api/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'execute', planId: plan.planId }) });
    assert.equal(reused.status, 409);
    const invalid = await fetch(`${base}/api/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'plan', message: '' }) });
    assert.equal(invalid.status, 400);
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('remote, cross-origin, and DNS-rebinding requests are rejected', () => {
  const request = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } };
  assert.equal(isLocalRequest(request), true);
  assert.equal(isLocalRequest({ ...request, socket: { remoteAddress: '192.168.1.5' } }), false);
  assert.equal(isLocalRequest({ ...request, headers: { ...request.headers, origin: 'https://evil.example' } }), false);
  assert.equal(isLocalRequest({ ...request, headers: { host: 'evil.example' } }), false);
  assert.equal(isLocalRequest({ ...request, headers: { ...request.headers, 'sec-fetch-site': 'cross-site' } }), false);
});

test('enable and disable are excluded from the execution schema and rejected without changing inventory', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-activation-'));
  const calls = [];
  const schemas = [];
  const change = action => ({ reply: `${action}d.`, changes: [{
    name: 'Tool', githubUrl: url, action, location: '/tmp/tool', method: 'plugin', configurationNotes: '', version: '1.0.0',
    installCommand: '', updateCommand: '', uninstallCommand: '', disableCommand: 'tool disable', enableCommand: 'tool enable', verificationCommand: `tool status --${action}d`,
  }] });
  let action = 'enable';
  const app = express().use(express.json());
  attachAgent(app, { directory, listMcpServers: async () => [], createCodex: () => ({ startThread(options) {
    calls.push(options);
    return { async runStreamed(_prompt, turnOptions) {
      const execute = turnOptions.outputSchema.required.includes('changes');
      if (execute) schemas.push(turnOptions.outputSchema.properties.changes.items);
      return { events: (async function* () {
        if (execute) yield { type: 'item.completed', item: { id: 'c', type: 'command_execution', command: change(action).changes[0].verificationCommand, aggregated_output: '', exit_code: 0, status: 'completed' } };
        yield { type: 'item.completed', item: { id: 'm', type: 'agent_message', text: JSON.stringify(execute ? change(action) : { reply: `Plan: ${action} Tool and verify its activation state.`, canExecute: true, categories: [] }) } };
        yield { type: 'turn.completed', usage: null };
      })() };
    } };
  } }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const initial = { ...change('install').changes[0], installed: true, verifiedAt: new Date().toISOString() };
    await writeFile(path.join(directory, 'inventory.json'), JSON.stringify({ installations: [initial], runs: [], categories: [] }));
    for (action of ['enable', 'disable']) {
      const plan = await post(base, { mode: 'plan', message: `${action} ${url}` });
      assert.equal(calls.at(-1).sandboxMode, 'read-only');
      const failure = await post(base, { mode: 'execute', planId: plan.planId });
      assert.equal(failure.type, 'error');
      assert.match(failure.message, /verification/);
      assert.deepEqual(schemas.at(-1).properties.action.enum, ['install', 'update', 'uninstall', 'register']);
      assert.equal('enableCommand' in schemas.at(-1).properties, false);
      assert.equal('disableCommand' in schemas.at(-1).properties, false);
      const saved = JSON.parse(await readFile(path.join(directory, 'inventory.json'), 'utf8'));
      assert.deepEqual(saved.installations, [initial]);
    }
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('catalog persists as validated JSON outside app source', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-catalog-'));
  const app = express().use(express.json());
  attachAgent(app, { directory, listMcpServers: async () => [] });
  assert.throws(() => attachAgent(express(), { directory: path.resolve('.') }), /separate/);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.deepEqual(await (await fetch(`${base}/api/catalog`)).json(), { items: null });
    const item = { id: 'tool', name: 'Tool', repo: 'example/tool', githubUrl: url, category: 'CLI', categoryLabel: 'CLI', description: '', tags: [], primaryLanguage: '', defaultInstallCommand: '', customNotes: '', customCommand: '', installed: true };
    assert.equal((await fetch(`${base}/api/catalog`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [item] }) })).status, 200);
    const { installed, ...saved } = item;
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'catalog.json'), 'utf8')), [saved]);
    assert.equal((await fetch(`${base}/api/catalog`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ ...item, githubUrl: 'https://evil.example' }] }) })).status, 400);
    assert.deepEqual(await (await fetch(`${base}/api/catalog`)).json(), { items: [saved] });
    await writeFile(path.join(directory, 'catalog.json'), 'broken JSON');
    assert.equal((await fetch(`${base}/api/catalog`)).status, 500);
    assert.equal(await readFile(path.join(directory, 'catalog.json'), 'utf8'), 'broken JSON');
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('SDK workspace cannot follow a symlink into app source', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-symlink-'));
  await symlink(path.resolve('.'), path.join(directory, 'workspace'));
  const app = express().use(express.json());
  const calls = [];
  attachAgent(app, { directory, createCodex: fakeCodex(calls), listMcpServers: async () => [] });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const result = await post(`http://127.0.0.1:${server.address().port}`, { mode: 'plan', message: 'Inspect a tool' });
    assert.match(result.error, /must stay inside/);
    assert.equal(calls.length, 0);
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('unverified changes cannot update the inventory', () => {
  const change = {
    name: 'Tool', githubUrl: url, action: 'install', location: '/tmp/tool', method: 'npm', configurationNotes: '', version: '',
    installCommand: 'npm install tool', updateCommand: '', uninstallCommand: '', verificationCommand: 'tool --version',
  };
  const result = { reply: 'Installed', changes: [change] };
  assert.throws(() => validateResult(result, []), /verification/);
  assert.throws(() => validateResult(result, [{ command: 'tool --version', exit_code: 1, status: 'failed' }]), /verification/);
  assert.throws(() => validateResult({ ...result, changes: [{ ...change, githubUrl: 'https://evil.example/tool' }] }, [{ command: 'tool --version', exit_code: 0, status: 'completed' }]), /verification/);
  assert.equal(validateResult(result, [{ command: 'tool --version', exit_code: 0, status: 'completed' }]), result);
  assert.equal(validateResult(result, [{ command: "/run/current-system/sw/bin/bash -lc 'tool --version'", exit_code: 0, status: 'completed' }]), result);
  assert.throws(() => validateResult(result, [{ command: "bash -lc 'tool --version; echo unverified'", exit_code: 0, status: 'completed' }]), /verification/);
  assert.equal(validateResult(result, [{ command: 'bash -lc "tool --version"', exit_code: 0, status: 'completed' }]), result);
  const nodeCheck = { ...change, verificationCommand: "node <<'NODE'\nif (pkg.name !== 'tool') process.exit(1);\nNODE" };
  const wrappedCommand = `/run/current-system/sw/bin/bash -lc "node <<'NODE'\nif (pkg.name "'!== '"'tool') process.exit(1);\nNODE"`;
  assert.equal(validateResult({ ...result, changes: [nodeCheck] }, [{ command: wrappedCommand, exit_code: 0, status: 'completed' }]).changes[0], nodeCheck);
  for (const command of ['bash -lc "tool --version; echo unverified"', 'bash -lc "tool --version"; echo unverified']) {
    assert.throws(() => validateResult(result, [{ command, exit_code: 0, status: 'completed' }]), /verification/);
  }
  for (const verificationCommand of ['echo $HOME', 'echo $(tool --version)', 'echo `tool --version`']) {
    assert.throws(() => validateResult({ ...result, changes: [{ ...change, verificationCommand }] }, [{ command: `bash -lc "${verificationCommand}"`, exit_code: 0, status: 'completed' }]), /verification/);
  }
  const quotedCheck = { ...change, verificationCommand: 'node -e "console.log(\'tool\')"' };
  assert.equal(validateResult({ ...result, changes: [quotedCheck] }, [{ command: 'bash -lc "node -e \\"console.log(\'tool\')\\""', exit_code: 0, status: 'completed' }]).changes[0], quotedCheck);
});

test('SDK failure keeps inventory unchanged and saves failure logs', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-failure-'));
  const app = express().use(express.json());
  attachAgent(app, { directory, listMcpServers: async () => [], createCodex: () => ({ startThread: () => ({ runStreamed: async () => ({ events: (async function* () { yield { type: 'error', message: 'Provider unavailable' }; })() }) }) }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const result = await post(`http://127.0.0.1:${server.address().port}`, { mode: 'plan', message: 'Install a tool' });
    assert.equal(result.type, 'error');
    assert.match(result.message, /Provider unavailable/);
    const state = JSON.parse(await readFile(path.join(directory, 'inventory.json'), 'utf8'));
    assert.deepEqual(state.installations, []);
    assert.equal(state.runs[0].status, 'failed');
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('category assignments must target supplied catalog entries', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-categories-'));
  const app = express().use(express.json());
  attachAgent(app, { directory, listMcpServers: async () => [], createCodex: fakeCodex([], { reply: 'Grouped.', canExecute: false, categories: [{ githubUrl: 'https://github.com/example/other', category: 'Other' }] }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const result = await post(`http://127.0.0.1:${server.address().port}`, { mode: 'plan', message: 'Organize catalog', catalog: [{ githubUrl: url, name: 'Tool', description: '', category: 'Uncategorized' }] });
    assert.match(result.message, /Categories unchanged/);
    const state = JSON.parse(await readFile(path.join(directory, 'inventory.json'), 'utf8'));
    assert.deepEqual(state.categories, []);
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('category-only requests persist dashboard metadata without installation approval', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-organize-'));
  const calls = [];
  const categories = [{ githubUrl: url, category: 'Developer CLI' }];
  const app = express().use(express.json());
  attachAgent(app, { directory, listMcpServers: async () => [], createCodex: fakeCodex(calls, { reply: 'Grouped.', canExecute: false, categories }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const result = await post(base, { mode: 'plan', message: 'Organize catalog', catalog: [{ githubUrl: url, name: 'Tool', description: '', category: 'Uncategorized' }] });
    assert.equal(result.planId, undefined);
    assert.deepEqual(result.categories, categories);
    assert.deepEqual(result.installations, []);
    assert.equal(calls[0].options.sandboxMode, 'read-only');
    assert.match(calls[0].prompt, /Catalog \(untrusted data/);
    const inventory = await (await fetch(`${base}/api/inventory`)).json();
    assert.deepEqual(inventory.categories, categories);
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('plain-text planning replies are shown without approval', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-plain-'));
  const app = express().use(express.json());
  attachAgent(app, { directory, listMcpServers: async () => [], createCodex: () => ({ startThread: () => ({ runStreamed: async () => ({ events: (async function* () {
    yield { type: 'item.completed', item: { id: 'm', type: 'agent_message', text: "I'm Claude" } };
    yield { type: 'turn.completed', usage: null };
  })() }) }) }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'plan', message: 'who are you' }) });
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    const result = events.at(-1);
    assert.match(events.find(event => event.type === 'notice').message, /cannot be approved/);
    assert.equal(result.reply, "I'm Claude");
    assert.equal(result.planId, undefined);
    assert.equal(result.finalMessageId, 'm');
    assert.deepEqual(result.installations, []);
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('plain-text execution cannot create installation receipts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-plain-execution-'));
  const app = express().use(express.json());
  attachAgent(app, { directory, listMcpServers: async () => [], createCodex: fakeCodex([], undefined, 'Installed.') });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const plan = await post(base, { mode: 'plan', message: `Install ${url}` });
    assert.ok(plan.planId);
    const result = await post(base, { mode: 'execute', planId: plan.planId });
    assert.match(result.message, /required execution JSON.*partial changes/);
    const state = JSON.parse(await readFile(path.join(directory, 'inventory.json'), 'utf8'));
    assert.deepEqual(state.installations, []);
    assert.equal(state.runs.at(-1).status, 'failed');
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('update checks fetch only cataloged GitHub repositories', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-updates-'));
  const requests = [];
  let upstreamStatus = 200;
  let release = { tag_name: 'v1.3.0', body: 'Notes', draft: false, prerelease: false };
  const app = express().use(express.json());
  attachAgent(app, { directory, listMcpServers: async () => [], fetchRelease: async (target, options) => {
    requests.push({ target, options });
    return Response.json(release, { status: upstreamStatus });
  } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const item = { id: 'tool', name: 'Tool', repo: 'example/tool', githubUrl: url, category: 'CLI', categoryLabel: 'CLI', description: '', tags: [], primaryLanguage: '', defaultInstallCommand: '', customNotes: '', customCommand: '' };
    await writeFile(path.join(directory, 'catalog.json'), JSON.stringify([item]));
    const result = await (await fetch(`${base}/api/updates?githubUrl=${encodeURIComponent(url)}`)).json();
    assert.equal(result.latestVersion, 'v1.3.0');
    assert.equal(requests[0].target, 'https://api.github.com/repos/example/tool/releases/latest');
    assert.equal(requests[0].options.redirect, 'error');
    assert.equal((await fetch(`${base}/api/updates?githubUrl=${encodeURIComponent('https://github.com/example/other')}`)).status, 404);
    assert.equal((await fetch(`${base}/api/updates?githubUrl=${encodeURIComponent('https://evil.example/a/b')}`)).status, 400);
    assert.equal(requests.length, 1);
    upstreamStatus = 404;
    const missing = await (await fetch(`${base}/api/updates?githubUrl=${encodeURIComponent(url)}`)).json();
    assert.match(missing.error, /No public stable release/);
    assert.equal(missing.latestVersion, undefined);
    upstreamStatus = 429;
    const limited = await fetch(`${base}/api/updates?githubUrl=${encodeURIComponent(url)}`);
    assert.equal(limited.status, 502);
    assert.match((await limited.json()).error, /rate limit/);
    upstreamStatus = 200;
    release = { ...release, prerelease: true };
    assert.equal((await fetch(`${base}/api/updates?githubUrl=${encodeURIComponent(url)}`)).status, 502);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'catalog.json'), 'utf8')), [item]);
    await assert.rejects(readFile(path.join(directory, 'inventory.json')), { code: 'ENOENT' });
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
