import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, readFile, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { attachAgent as attachAgentWithOptions, isLocalRequest, validateResult } from '../agent.mjs';

const attachAgent = (app, options) => attachAgentWithOptions(app, { fetchDocumentation: async () => new Response(null, { status: 404 }), ...options });

const url = 'https://github.com/example/tool';

test('runtime API exposes plans without mutation and executes only approved plan IDs', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-runtime-api-'));
  const home = path.join(directory, 'home');
  await mkdir(home);
  const calls = [];
  const app = express().use(express.json());
  const stop = attachAgent(app, { directory: path.join(directory, 'data'), createCodex: fakeCodex([]), listMcpServers: async () => [], runtimeOptions: { home, run: async (...args) => { calls.push(args); return { stdout: 'LoadState=loaded\nActiveState=inactive\nUnitFileState=disabled\n' }; } } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (route, body) => fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const plan = await (await post('/api/runtime/plan', { kind: 'agent', category: 'skill', agent: 'codex', name: 'review', description: 'Review', content: 'Review carefully.' })).json();
    await assert.rejects(readFile(path.join(directory, 'data/workspace/.agents/skills/review/SKILL.md')), { code: 'ENOENT' });
    assert.equal((await post('/api/runtime/execute', {})).status, 400);
    assert.equal((await post('/api/runtime/execute', { planId: plan.id })).status, 200);
    assert.match(await readFile(path.join(directory, 'data/workspace/.agents/skills/review/SKILL.md'), 'utf8'), /Review carefully/);
    assert.equal((await post('/api/runtime/execute', { planId: plan.id })).status, 400);
    assert.equal(calls.length, 0);
  } finally {
    server.close();
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});

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
    const wrapper = path.join(directory, 'store', 'hash-tool-bwrap');
    await writeFile(wrapper, '#!/bin/sh\nexit 99\n', { mode: 0o755 });
    await rm(path.join(store, 'bin', 'tool'));
    await symlink(wrapper, path.join(store, 'bin', 'tool'));
    assert.equal((await inventory())[0]?.installed, true);
    await writeFile(path.join(directory, 'inventory.json'), JSON.stringify({ installations: [receipt], runs: [] }));
    assert.equal((await inventory())[0].installed, true);
    await rm(path.join(profile, 'bin'));
    await mkdir(path.join(profile, 'bin'));
    const unrelated = path.join(directory, 'unrelated');
    await writeFile(unrelated, '#!/bin/sh\nexit 99\n', { mode: 0o755 });
    await symlink(unrelated, path.join(profile, 'bin', 'tool'));
    assert.equal((await inventory())[0].installed, false);
    await rm(path.join(profile, 'bin'), { recursive: true });
    await symlink(path.join(store, 'bin'), path.join(profile, 'bin'));
    assert.equal((await inventory())[0].installed, true);
    await writeFile(path.join(directory, 'inventory.json'), state);
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
            const result = execute && typeof execution === 'function' ? await execution() : execution;
            if (execute) yield { type: 'item.completed', item: { id: 'c', type: 'command_execution', command: 'tool --version', aggregated_output: '1.0.0', exit_code: 0, status: 'completed' } };
            yield { type: 'item.completed', item: { id: 'm', type: 'agent_message', text: execute ? result ?? JSON.stringify({ reply: 'Installed.', changes: [{ name: 'Tool', githubUrl: url, action: 'install', location: '/tmp/tool', method: 'npm', configurationNotes: '', version: '1.0.0', installCommand: 'npm i -g tool', updateCommand: 'npm i -g tool@latest', uninstallCommand: 'npm rm -g tool', verificationCommand: 'tool --version' }] }) : JSON.stringify(planning) } };
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

async function desktopFixture(context, action = 'create') {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode desktop-'));
  const data = path.join(directory, 'data');
  const workspace = path.join(data, 'workspace');
  const appDirectory = path.join(workspace, 'apps', 'tool');
  const desktopDataHome = path.join(directory, 'home', 'share');
  const source = path.join(appDirectory, 'dotcode-tool.desktop');
  const link = path.join(desktopDataHome, 'applications', 'dotcode-tool.desktop');
  await mkdir(path.join(appDirectory, 'bin'), { recursive: true });
  await writeFile(path.join(appDirectory, 'bin', 'tool'), '#!/bin/sh\nexit 99\n', { mode: 0o755 });
  await writeFile(path.join(appDirectory, 'icon.png'), 'mock icon');
  const entry = { action, appId: 'tool', executable: action === 'create' ? 'bin/tool' : '', args: [], icon: action === 'create' ? 'icon.png' : '' };
  const planning = { reply: 'Manage Tool.', canExecute: true, categories: [], desktopEntries: [entry] };
  const calls = [];
  let execution = async () => JSON.stringify({ reply: 'Verified.', changes: [] });
  const app = express().use(express.json());
  const stop = attachAgent(app, { directory: data, desktopDataHome, createCodex: fakeCodex(calls, planning, () => execution()), listMcpServers: async () => [] });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  context.after(async () => { server.close(); await stop(); await rm(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { directory, data, appDirectory, desktopDataHome, source, link, planning, entry, calls, base,
    setExecution: callback => { execution = callback; },
    plan: () => post(base, { mode: 'plan', message: 'Manage the Tool desktop launcher.' }),
    execute: planId => post(base, { mode: 'execute', planId }),
  };
}

test('desktop entries are created only after approval and package verification without widening the sandbox', async context => {
  const fixture = await desktopFixture(context);
  fixture.entry.args = ['--label', 'space $dollar `tick` "quote" \\slash %percent'];
  fixture.setExecution(async () => {
    await assert.rejects(lstat(fixture.link), { code: 'ENOENT' });
    await assert.rejects(lstat(fixture.source), { code: 'ENOENT' });
    return JSON.stringify({ reply: 'Verified existing package; no reinstall.', changes: [] });
  });
  const plan = await fixture.plan();
  assert.equal(plan.type, 'result');
  assert.match(plan.reply, /Desktop integration/);
  assert.ok(plan.reply.includes(fixture.link));
  assert.ok(plan.reply.includes(fixture.source));
  await assert.rejects(lstat(fixture.link), { code: 'ENOENT' });
  assert.ok(fixture.calls[0].turnOptions.outputSchema.required.includes('desktopEntries'));
  const result = await fixture.execute(plan.planId);
  assert.equal(result.type, 'result');
  assert.equal(await readlink(fixture.link), fixture.source);
  const content = await readFile(fixture.link, 'utf8');
  assert.match(content, /Type=Application\n/);
  assert.ok(content.includes(`Exec="${path.join(fixture.appDirectory, 'bin', 'tool')}"`));
  assert.ok(content.includes('%%percent'));
  assert.ok(content.includes('\\\\$dollar'));
  assert.ok(content.includes('\\\\"quote\\\\"'));
  assert.ok(content.includes('\\\\\\\\slash'));
  assert.ok(content.includes(`Icon=${path.join(fixture.appDirectory, 'icon.png')}`));
  assert.match(result.reply, /Created desktop entry/);
  assert.deepEqual(result.installations, []);
  assert.equal(fixture.calls[1].options.sandboxMode, 'workspace-write');
  assert.deepEqual(fixture.calls[1].clientOptions.config.sandbox_workspace_write.writable_roots, []);
  const saved = JSON.parse(await readFile(path.join(fixture.data, 'inventory.json'), 'utf8'));
  assert.ok(saved.runs.at(-1).events.some(event => /Created desktop entry/.test(event.message)));
  const reused = await fetch(`${fixture.base}/api/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'execute', planId: plan.planId }) });
  assert.equal(reused.status, 409);
});

test('direct chat keeps host desktop writes behind a desktop-only approval', async context => {
  const fixture = await desktopFixture(context);
  fixture.setExecution(async () => JSON.stringify({ reply: 'Launcher proposed.', categories: [], catalogChanges: [], desktopEntries: [fixture.entry], changes: [] }));
  const result = await post(fixture.base, { mode: 'chat', message: 'Create the Tool desktop launcher.' });
  assert.equal(result.type, 'result');
  assert.ok(result.planId);
  await assert.rejects(lstat(fixture.link), { code: 'ENOENT' });
  fixture.setExecution(async () => JSON.stringify({ reply: 'Ready.', changes: [] }));
  const approved = await fixture.execute(result.planId);
  assert.equal(approved.type, 'result');
  assert.equal(await readlink(fixture.link), fixture.source);
  assert.match(fixture.calls[1].prompt, /Do not repeat completed package operations/);
  assert.deepEqual(approved.installations, []);
});

test('approved uninstall removes its owned launcher before the sandboxed agent runs', async context => {
  const fixture = await desktopFixture(context, 'remove');
  await writeFile(fixture.source, '[Desktop Entry]\nType=Application\nName=Tool\n');
  await mkdir(path.dirname(fixture.link), { recursive: true });
  await symlink(fixture.source, fixture.link);
  fixture.setExecution(async () => {
    await assert.rejects(lstat(fixture.link), { code: 'ENOENT' });
    assert.match(fixture.calls.at(-1).prompt, /Removed desktop entry/);
    return JSON.stringify({ reply: 'Uninstalled.', changes: [{ name: 'Tool', githubUrl: url, action: 'uninstall', location: fixture.appDirectory, method: 'mock', configurationNotes: '', version: '', installCommand: '', updateCommand: '', uninstallCommand: '', verificationCommand: 'tool --version' }] });
  });
  const plan = await fixture.plan();
  assert.equal((await lstat(fixture.link)).isSymbolicLink(), true);
  const result = await fixture.execute(plan.planId);
  assert.equal(result.type, 'result');
  assert.equal(result.installations[0].installed, false);
  assert.match(result.reply, /Removed desktop entry/);
  await assert.rejects(lstat(fixture.link), { code: 'ENOENT' });
  assert.match(await readFile(fixture.source, 'utf8'), /Name=Tool/);
});

test('desktop approval rejects invalid scope, foreign launchers and stale paths without host mutation', async context => {
  for (const scenario of ['traversal', 'absolute executable', 'argument newline', 'foreign link', 'regular launcher', 'symlinked applications', 'dangling data parent', 'symlinked app', 'stale link', 'stale source', 'missing executable', 'duplicate', 'unapproved']) {
    await context.test(scenario, async nested => {
      const fixture = await desktopFixture(nested, scenario === 'stale link' ? 'remove' : 'create');
      const foreign = path.join(fixture.directory, 'foreign');
      await writeFile(foreign, 'preserve');
      await mkdir(path.dirname(fixture.link), { recursive: true });
      if (scenario === 'traversal') fixture.entry.appId = '../escape';
      if (scenario === 'absolute executable') fixture.entry.executable = '/bin/sh';
      if (scenario === 'argument newline') fixture.entry.args = ['--label\nType=Link'];
      if (scenario === 'foreign link') await symlink(foreign, fixture.link);
      if (scenario === 'regular launcher') await writeFile(fixture.link, 'preserve');
      if (scenario === 'symlinked applications') {
        await rm(path.dirname(fixture.link), { recursive: true });
        await symlink(fixture.directory, path.dirname(fixture.link));
      }
      if (scenario === 'dangling data parent') {
        await rm(fixture.desktopDataHome, { recursive: true });
        await symlink(path.join(fixture.directory, 'missing'), fixture.desktopDataHome);
      }
      if (scenario === 'symlinked app') {
        await rm(fixture.appDirectory, { recursive: true });
        await symlink(fixture.directory, fixture.appDirectory);
      }
      if (scenario === 'duplicate') fixture.planning.desktopEntries.push({ ...fixture.entry });
      if (scenario === 'unapproved') fixture.planning.canExecute = false;
      if (scenario === 'stale link') await symlink(fixture.source, fixture.link);
      const plan = await fixture.plan();
      if (['stale link', 'stale source', 'missing executable'].includes(scenario)) {
        assert.equal(plan.type, 'result');
        if (scenario === 'stale link') { await rm(fixture.link); await writeFile(fixture.link, 'preserve'); }
        if (scenario === 'stale source') await writeFile(fixture.source, 'changed after approval');
        if (scenario === 'missing executable') await rm(path.join(fixture.appDirectory, 'bin', 'tool'));
        const result = await fixture.execute(plan.planId);
        assert.equal(result.type, 'error');
        assert.match(result.message, /desktop|executable/i);
      } else {
        assert.equal(plan.type, 'error');
      }
      assert.equal(await readFile(foreign, 'utf8'), 'preserve');
      if (['regular launcher', 'stale link'].includes(scenario)) assert.equal(await readFile(fixture.link, 'utf8'), 'preserve');
      if (scenario === 'foreign link') assert.equal(await readlink(fixture.link), foreign);
      assert.equal(fixture.calls.length, scenario === 'missing executable' ? 2 : 1);
    });
  }
});

test('desktop integration handles broken owned links and reports partial package failures', async context => {
  await context.test('broken owned link can be removed', async nested => {
    const fixture = await desktopFixture(nested, 'remove');
    await mkdir(path.dirname(fixture.link), { recursive: true });
    await symlink(fixture.source, fixture.link);
    const plan = await fixture.plan();
    const result = await fixture.execute(plan.planId);
    assert.equal(result.type, 'result');
    await assert.rejects(lstat(fixture.link), { code: 'ENOENT' });
  });
  await context.test('package failure retains its receipt and records completed removal', async nested => {
    const fixture = await desktopFixture(nested, 'remove');
    await mkdir(path.dirname(fixture.link), { recursive: true });
    await symlink(fixture.source, fixture.link);
    const receipt = { githubUrl: url, installed: true, location: fixture.appDirectory, method: 'mock' };
    await writeFile(path.join(fixture.data, 'inventory.json'), JSON.stringify({ installations: [receipt], runs: [] }));
    fixture.setExecution(async () => { throw new Error('Package removal failed.'); });
    const plan = await fixture.plan();
    const result = await fixture.execute(plan.planId);
    assert.equal(result.type, 'error');
    assert.match(result.message, /Package removal failed.*Completed desktop changes: Removed desktop entry/);
    const saved = JSON.parse(await readFile(path.join(fixture.data, 'inventory.json'), 'utf8'));
    assert.deepEqual(saved.installations, [receipt]);
    assert.ok(saved.runs.at(-1).events.some(event => /Removed desktop entry/.test(event.message)));
  });
  await context.test('launcher failure preserves verified installation receipt', async nested => {
    const fixture = await desktopFixture(nested);
    const change = { name: 'Tool', githubUrl: url, action: 'install', location: fixture.appDirectory, method: 'mock', configurationNotes: '', version: '1.0.0', installCommand: '', updateCommand: '', uninstallCommand: '', verificationCommand: 'tool --version' };
    fixture.setExecution(async () => JSON.stringify({ reply: 'Verified package.', changes: [change] }));
    await rm(path.join(fixture.appDirectory, 'icon.png'));
    const plan = await fixture.plan();
    const result = await fixture.execute(plan.planId);
    assert.equal(result.type, 'error');
    assert.match(result.message, /Desktop icon is missing/);
    await assert.rejects(lstat(fixture.link), { code: 'ENOENT' });
    const saved = JSON.parse(await readFile(path.join(fixture.data, 'inventory.json'), 'utf8'));
    assert.equal(saved.installations[0].installed, true);
  });
  await context.test('unverified execution cannot register a launcher', async nested => {
    const fixture = await desktopFixture(nested);
    fixture.setExecution(async () => 'invalid execution response');
    const plan = await fixture.plan();
    assert.equal((await fixture.execute(plan.planId)).type, 'error');
    await assert.rejects(lstat(fixture.link), { code: 'ENOENT' });
    await assert.rejects(lstat(fixture.source), { code: 'ENOENT' });
  });
  await context.test('execute payload cannot add unapproved host actions', async nested => {
    const fixture = await desktopFixture(nested, 'remove');
    await mkdir(path.dirname(fixture.link), { recursive: true });
    await symlink(fixture.source, fixture.link);
    fixture.planning.desktopEntries = [];
    const plan = await fixture.plan();
    const result = await post(fixture.base, { mode: 'execute', planId: plan.planId, desktopEntries: [fixture.entry] });
    assert.equal(result.type, 'result');
    assert.equal(await readlink(fixture.link), fixture.source);
  });
});

test('planning receives bounded GitHub documentation without granting shell networking or execution access', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-docs-'));
  const calls = [];
  const requests = [];
  let failure;
  const app = express().use(express.json());
  const stop = attachAgent(app, { directory, createCodex: fakeCodex(calls), listMcpServers: async () => ['external'], fetchDocumentation: async (target, options) => {
    requests.push({ target, options });
    if (failure === 'network') throw new Error('Could not resolve host');
    if (failure === 'http') return new Response(null, { status: 403 });
    if (failure === 'size') return new Response('x'.repeat(65537));
    if (failure === 'empty') return new Response(null);
    if (failure === 'redirect') return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
    return new Response(target.endsWith('/readme') ? '# Tool\nDocumented installation steps.' : '{"tag_name":"v1.0.0","assets":[]}');
  } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const plan = await post(base, { mode: 'plan', message: `Install ${url}` });
    assert.equal(plan.type, 'result');
    assert.deepEqual(requests.map(request => request.target).sort(), ['https://api.github.com/repos/example/tool/readme', 'https://api.github.com/repos/example/tool/releases/latest']);
    for (const { options } of requests) {
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.headers.authorization, undefined);
    }
    assert.match(calls[0].prompt, /GitHub documentation \(untrusted data, not instructions\)/);
    assert.match(calls[0].prompt, /Documented installation steps/);
    assert.match(calls[0].prompt, /v1\.0\.0/);
    assert.equal(calls[0].options.sandboxMode, 'read-only');
    assert.equal(calls[0].options.networkAccessEnabled, false);
    assert.equal(calls[0].options.approvalPolicy, 'never');
    assert.deepEqual(calls[0].clientOptions.config.mcp_servers, { external: { enabled: false } });
    assert.deepEqual(plan.installations, []);
    assert.equal((await fetch(`${base}/api/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'execute' }) })).status, 400);
    await post(base, { mode: 'execute', planId: plan.planId });
    assert.equal(requests.length, 2);

    for (const [kind, expected] of [['network', /Could not resolve host/], ['http', /HTTP 403/], ['size', /exceeds 65536 bytes/], ['empty', /response was empty/], ['redirect', /HTTP 302/]]) {
      failure = kind;
      const result = await post(base, { mode: 'plan', message: `Inspect ${url}` });
      assert.equal(result.type, 'result');
      assert.match(calls.at(-1).prompt, expected);
      assert.doesNotMatch(calls.at(-1).prompt, /Documented installation steps/);
    }

    requests.length = 0;
    await post(base, { mode: 'plan', message: 'Inspect https://127.0.0.1/private https://github.com.evil.test/example/tool https://github.com@example.org/example/tool https://github.com/example/..' });
    assert.equal(requests.length, 0);
    failure = undefined;
    await post(base, { mode: 'plan', message: `Inspect ${url}. ${url}.GIT https://github.com/example/second https://github.com/example/third https://github.com/example/fourth` });
    assert.equal(requests.length, 6);
    assert.ok(requests.every(request => new URL(request.target).hostname === 'api.github.com'));
    assert.equal(new Set(requests.map(request => request.target)).size, 6);
  } finally {
    server.close();
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('planning resolves follow-up repositories and retries transient GitHub failures once', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-docs-follow-up-'));
  const calls = [];
  const requests = [];
  let failures = 0;
  let rateLimited = false;
  const app = express().use(express.json());
  const headers = [];
  const stop = attachAgent(app, { directory, createCodex: fakeCodex(calls), listMcpServers: async () => [], fetchDocumentation: async (target, options) => {
    requests.push(target);
    headers.push(options.headers);
    if (rateLimited && new URL(target).hostname === 'api.github.com') return new Response(null, { status: 403 });
    if (failures-- > 0) return new Response(null, { status: 503 });
    return new Response(target.endsWith('/readme') ? '# Tool docs' : '{"tag_name":"v2.0.0"}');
  } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    await post(base, { mode: 'plan', message: 'Install it now', history: [{ role: 'user', text: `Install ${url}` }, { role: 'model', text: 'Blocked.' }] });
    assert.deepEqual(requests.sort(), ['https://api.github.com/repos/example/tool/readme', 'https://api.github.com/repos/example/tool/releases/latest']);
    assert.match(calls.at(-1).prompt, /v2\.0\.0/);

    requests.length = 0;
    await post(base, { mode: 'plan', message: 'Uninstall Tool please', catalog: [{ githubUrl: url, name: 'Tool', description: '', category: 'Tools' }] });
    assert.equal(requests.length, 2);

    requests.length = 0;
    failures = 2;
    await post(base, { mode: 'plan', message: `Inspect ${url}` });
    assert.equal(requests.length, 4);
    assert.match(calls.at(-1).prompt, /Tool docs/);
    assert.doesNotMatch(calls.at(-1).prompt, /HTTP 503/);

    const originalToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'test-token';
    try { await post(base, { mode: 'plan', message: `Inspect ${url}` }); } finally {
      if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = originalToken;
    }
    assert.equal(headers.at(-1).authorization, 'Bearer test-token');

    requests.length = 0;
    rateLimited = true;
    await post(base, { mode: 'plan', message: `Inspect ${url}` });
    assert.ok(requests.includes('https://raw.githubusercontent.com/example/tool/HEAD/README.md'));
    assert.ok(requests.includes('https://github.com/example/tool/releases.atom'));
    for (const [index, target] of requests.entries()) {
      if (new URL(target).hostname !== 'api.github.com') assert.equal(headers.at(-requests.length + index).authorization, undefined);
    }
    assert.match(calls.at(-1).prompt, /v2\.0\.0/);

    requests.length = 0;
    await post(base, { mode: 'plan', message: 'Hello', catalog: [{ githubUrl: url, name: 'Tool', description: '', category: 'Tools' }] });
    assert.equal(requests.length, 0);
  } finally {
    server.close();
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('stopping chat cancels documentation retrieval before starting Codex', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-docs-stop-'));
  const calls = [];
  const signals = [];
  let ready;
  const started = new Promise(resolve => { ready = resolve; });
  const app = express().use(express.json());
  const stop = attachAgent(app, { directory, createCodex: fakeCodex(calls), listMcpServers: async () => [], fetchDocumentation: async (_, { signal }) => {
    signals.push(signal);
    if (signals.length === 2) ready();
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const request = post(`http://127.0.0.1:${server.address().port}`, { mode: 'plan', message: `Install ${url}` });
    await started;
    await stop();
    assert.match((await request).message, /Stopped or timed out/);
    assert.ok(signals.every(signal => signal.aborted));
    assert.equal(calls.length, 0);
  } finally {
    server.close();
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});

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

test('execution JSON after narrative text still creates a verified receipt', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-narrated-execution-'));
  const change = { name: 'Tool', githubUrl: url, action: 'install', location: '/tmp/tool', method: 'npm', configurationNotes: '', version: '1.0.0', installCommand: 'npm i -g tool', updateCommand: '', uninstallCommand: '', verificationCommand: 'tool --version' };
  const app = express().use(express.json());
  attachAgent(app, { directory, listMcpServers: async () => [], createCodex: fakeCodex([], undefined, `## Installed\n\nDetails.\n\n${JSON.stringify({ reply: 'Installed.', changes: [change] })}`) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const plan = await post(base, { mode: 'plan', message: `Install ${url}` });
    const result = await post(base, { mode: 'execute', planId: plan.planId });
    assert.equal(result.reply, 'Installed.');
    assert.equal(result.installations[0].installed, true);
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('direct chat installs and saves catalog metadata without a planning turn', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-direct-'));
  const calls = [];
  const item = { ...Object.fromEntries(['category', 'categoryLabel', 'description', 'primaryLanguage', 'defaultInstallCommand', 'customNotes', 'customCommand'].map(field => [field, 'Tools'])), id: 'tool', name: 'Tool', repo: 'example/tool', githubUrl: url, tags: [] };
  const execution = { reply: 'Installed.', canExecute: false, categories: [{ githubUrl: url, category: 'CLI' }], catalogChanges: [{ action: 'create', githubUrl: url, item }], desktopEntries: [], changes: [{ name: 'Tool', githubUrl: url, action: 'install', location: '/tmp/tool', method: 'test', configurationNotes: '', version: '1.0.0', installCommand: 'install-tool', updateCommand: '', uninstallCommand: '', verificationCommand: 'tool --version' }] };
  let output = () => JSON.stringify(execution);
  const app = express().use(express.json());
  attachAgent(app, { directory, listMcpServers: async () => ['external'], createCodex: fakeCodex(calls, undefined, () => output()) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const result = await post(base, { mode: 'chat', message: `Install ${url}`, history: [] });
    assert.equal(result.type, 'result');
    assert.equal(result.planId, undefined);
    assert.equal(result.installations[0].installed, true);
    assert.deepEqual(result.categories, execution.categories);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.sandboxMode, 'workspace-write');
    assert.equal(calls[0].options.networkAccessEnabled, true);
    assert.equal(calls[0].options.approvalPolicy, 'never');
    assert.deepEqual(calls[0].clientOptions.config.mcp_servers, { external: { enabled: false } });
    assert.deepEqual(calls[0].clientOptions.config.sandbox_workspace_write, { writable_roots: [], exclude_tmpdir_env_var: true, exclude_slash_tmp: true });
    assert.match(calls[0].prompt, /Do not use sudo/);
    assert.equal((await (await fetch(`${base}/api/catalog`)).json()).items[0].githubUrl, url);
    execution.changes[0].verificationCommand = 'never-ran';
    assert.equal((await post(base, { mode: 'chat', message: 'Update Tool' })).type, 'error');
    const state = JSON.parse(await readFile(path.join(directory, 'inventory.json'), 'utf8'));
    assert.equal(state.installations[0].verificationCommand, 'tool --version');
    output = () => 'Stopped. sudo is required; run the privileged step manually.';
    const blocked = await post(base, { mode: 'chat', message: 'Install another tool' });
    assert.equal(blocked.type, 'result');
    assert.match(blocked.reply, /sudo is required/);
    assert.match(blocked.reply, /Inventory unchanged.*partial changes/);
    assert.equal(blocked.installations.length, 1);
    output = () => '```json\n{"reply":"Nothing changed.","changes":[],"categories":[],"catalogChanges":[],"desktopEntries":[]}\n```';
    assert.equal((await post(base, { mode: 'chat', message: 'Inspect Tool' })).reply, 'Nothing changed.');
    output = () => '{"reply":"Installed.","changes":[';
    const malformed = await post(base, { mode: 'chat', message: 'Inspect Tool' });
    assert.match(malformed.reply, /Inventory unchanged/);
    assert.equal(malformed.installations.length, 1);
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
