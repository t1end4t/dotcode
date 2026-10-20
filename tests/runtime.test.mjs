import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRuntime } from '../runtime.mjs';

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'dotcode-runtime-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'managed');
  const home = path.join(root, 'home');
  await mkdir(directory);
  await mkdir(home);
  const calls = [];
  let active = 'active';
  const run = async (program, args) => {
    calls.push([program, args]);
    if (args[1] === 'stop') active = 'inactive';
    if (program === 'systemctl') return { stdout: `LoadState=loaded\nActiveState=${active}\nSubState=running\nUnitFileState=enabled\nMainPID=42\n` };
    return { stdout: 'test' };
  };
  const runtime = createRuntime({ directory, home, run, ...options });
  return { root, directory, home, calls, runtime };
}

test('runtime planning never writes; execution uses a single-use server-side plan', async t => {
  const { runtime, calls, directory } = await fixture(t);
  const plan = await runtime.plan({ kind: 'service', id: '9router', action: 'stop' });
  assert.ok(plan.id);
  assert.equal(calls.length, 0);
  await assert.rejects(readFile(path.join(directory, 'runtime/state.json')), { code: 'ENOENT' });
  await runtime.execute(plan.id);
  assert.deepEqual(calls[0], ['systemctl', ['--user', 'stop', 'dotcode-9router.service']]);
  await assert.rejects(runtime.execute(plan.id), /expired|used/);
});

test('runtime rejects arbitrary services, stale plans, traversal and symlink escapes', async t => {
  const { runtime, directory, root } = await fixture(t);
  await assert.rejects(runtime.plan({ kind: 'service', id: '../other', action: 'stop' }));
  await assert.rejects(runtime.plan({ kind: 'service', id: '9router', action: 'shell' }));
  await assert.rejects(runtime.plan({ kind: 'model', action: 'remove', fileName: '../outside.gguf' }));
  const plan = await runtime.plan({ kind: 'backend', backend: 'llama.cpp', endpoint: '' });
  await mkdir(path.join(directory, 'runtime'));
  await writeFile(path.join(directory, 'runtime/state.json'), JSON.stringify({ backend: 'external', endpoint: 'http://127.0.0.1:9000' }));
  await assert.rejects(runtime.execute(plan.id), /changed/);
  await symlink(root, path.join(directory, 'models'));
  await assert.rejects(runtime.plan({ kind: 'model', action: 'remove', fileName: 'outside.gguf' }), /symlink/);
});

test('legacy services are adopted without running or rewriting their commands', async t => {
  const { runtime, home, directory, calls } = await fixture(t);
  await mkdir(path.join(home, '.config/systemd/user'), { recursive: true });
  const oldUnit = path.join(home, '.config/systemd/user/thinking-os-srv-headroom.service');
  await writeFile(oldUnit, 'existing unit');
  const snapshot = await runtime.snapshot();
  assert.equal(snapshot.services.find(service => service.id === 'headroom').unit, 'thinking-os-srv-headroom.service');
  assert.equal(snapshot.services.find(service => service.id === 'headroom').running, true);
  await assert.rejects(runtime.plan({ kind: 'service', id: 'headroom', action: 'stop' }), /Take over/);
  const plan = await runtime.plan({ kind: 'service', id: 'headroom', action: 'adopt' });
  await runtime.execute(plan.id);
  assert.equal(await readFile(oldUnit, 'utf8'), 'existing unit');
  assert.ok(calls.every(([, args]) => args[1] === 'show'));
  assert.match(await readFile(path.join(directory, 'runtime/state.json'), 'utf8'), /thinking-os-srv-headroom/);
});

test('model imports copy regular GGUF files into managed storage without changing originals', async t => {
  const { runtime, home, directory } = await fixture(t);
  await mkdir(path.join(home, 'LOCAL-AI-MODELS'));
  await writeFile(path.join(home, 'LOCAL-AI-MODELS/model.gguf'), 'GGUF-test');
  await symlink('/etc/passwd', path.join(home, 'LOCAL-AI-MODELS/escape.gguf'));
  const snapshot = await runtime.snapshot();
  assert.deepEqual(snapshot.importableModels.map(model => model.fileName), ['model.gguf']);
  const plan = await runtime.plan({ kind: 'model', action: 'import', fileName: 'model.gguf' });
  await runtime.execute(plan.id);
  assert.equal(await readFile(path.join(directory, 'models/model.gguf'), 'utf8'), 'GGUF-test');
  assert.equal(await readFile(path.join(home, 'LOCAL-AI-MODELS/model.gguf'), 'utf8'), 'GGUF-test');
  await assert.rejects(runtime.plan({ kind: 'model', action: 'import', fileName: 'escape.gguf' }));
});

test('model starts bind loopback and never equate process spawn with readiness', async t => {
  let invocation;
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 42;
  child.exitCode = null;
  child.kill = () => { child.emit('exit', null, 'SIGTERM'); return true; };
  const { runtime, directory } = await fixture(t, {
    spawnProcess: (program, args, options) => { invocation = { program, args, options }; return child; },
    fetchRemote: async () => ({ ok: false }),
  });
  t.after(() => runtime.close());
  await mkdir(path.join(directory, 'models'));
  await writeFile(path.join(directory, 'models/model.gguf'), 'GGUF-test');
  const plan = await runtime.plan({ kind: 'model', action: 'start', fileName: 'model.gguf', port: 8090, contextLength: 4096, gpuLayers: 0 });
  await runtime.execute(plan.id);
  assert.equal(invocation.program, 'llama-server');
  assert.ok(invocation.args.includes('127.0.0.1'));
  assert.ok(invocation.args.includes(path.join(directory, 'models/model.gguf')));
  child.emit('spawn');
  assert.equal((await runtime.snapshot()).models[0].status, 'starting');
  child.emit('error', new Error('unavailable'));
  assert.equal((await runtime.snapshot()).models[0].status, 'failed');
});

test('backend endpoints are local-only, credential-free and redirect-safe', async t => {
  const requests = [];
  const { runtime } = await fixture(t, { fetchRemote: async (url, options) => {
    requests.push([url, options]);
    return { ok: true, json: async () => ({ data: [{ id: 'local-model' }] }) };
  } });
  for (const endpoint of ['https://example.com', 'http://127.0.0.1.evil:1234', 'http://user:pass@127.0.0.1:8000', 'http://localhost:8000', 'http://127.0.0.1:8000/private']) {
    await assert.rejects(runtime.plan({ kind: 'backend', backend: 'external', endpoint }));
  }
  const plan = await runtime.plan({ kind: 'backend', backend: 'external', endpoint: 'http://127.0.0.1:8000/v1' });
  await runtime.execute(plan.id);
  assert.equal((await runtime.snapshot()).external.models[0], 'local-model');
  assert.equal(requests[0][1].redirect, 'error');
});

test('agent forms create native project configs, preserve instructions, never touch global config', async t => {
  const { runtime, directory, home } = await fixture(t);
  await mkdir(path.join(directory, 'workspace'));
  await writeFile(path.join(directory, 'workspace/AGENTS.md'), '# Existing instructions\n');
  for (const request of [
    { kind: 'agent', category: 'skill', agent: 'codex', name: 'review-code', description: 'Review changes', content: 'Check correctness.' },
    { kind: 'agent', category: 'mcp', agent: 'codex', name: 'docs', transport: 'http', url: 'https://example.com/mcp' },
    { kind: 'agent', category: 'instruction', agent: 'codex', name: 'style', description: 'Code style', content: 'Use clear names.' },
  ]) await runtime.execute((await runtime.plan(request)).id);
  assert.match(await readFile(path.join(directory, 'workspace/.agents/skills/review-code/SKILL.md'), 'utf8'), /Review changes/);
  assert.match(await readFile(path.join(directory, 'workspace/.codex/config.toml'), 'utf8'), /\[mcp_servers\.docs\]/);
  const instructions = await readFile(path.join(directory, 'workspace/AGENTS.md'), 'utf8');
  assert.match(instructions, /# Existing instructions/);
  assert.match(instructions, /Use clear names/);
  await assert.rejects(readFile(path.join(home, '.codex/config.toml')), { code: 'ENOENT' });
  assert.equal((await runtime.snapshot()).agents.length, 3);
});

test('agent changes reject stale destinations, invalid inputs and symlinked config roots', async t => {
  const { runtime, directory, root } = await fixture(t);
  const request = { kind: 'agent', category: 'skill', agent: 'claude', name: 'test', description: 'Test', content: 'Test it.' };
  const plan = await runtime.plan(request);
  await mkdir(path.join(directory, 'workspace/.claude/skills/test'), { recursive: true });
  await writeFile(path.join(directory, 'workspace/.claude/skills/test/SKILL.md'), 'independent edit');
  await assert.rejects(runtime.execute(plan.id), /changed/);
  await assert.rejects(runtime.plan({ ...request, name: '../../escape' }));
  await assert.rejects(runtime.plan({ ...request, agent: 'other' }));
  await assert.rejects(runtime.plan({ ...request, content: '' }));
  await mkdir(path.join(directory, 'workspace/.agents'), { recursive: true });
  await symlink(root, path.join(directory, 'workspace/.agents/skills'));
  await assert.rejects(runtime.plan({ ...request, agent: 'codex' }), /symlink/);
});

test('expired runtime plans cannot execute', async t => {
  let time = 0;
  const { runtime } = await fixture(t, { now: () => time });
  const plan = await runtime.plan({ kind: 'service', id: '9router', action: 'stop' });
  time = 16 * 60 * 1000;
  await assert.rejects(runtime.execute(plan.id), /expired/);
});
