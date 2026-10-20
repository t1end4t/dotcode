import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRuntime } from '../runtime.mjs';

async function fixture(t, options = {}) {
  const { services = [
    { id: '9router', name: '9Router', port: 20128, unit: 'dotcode-9router.service', external: false, adopted: true },
    { id: 'headroom', name: 'Headroom', port: 8787, unit: 'thinking-os-srv-headroom.service', external: true, adopted: false },
  ], ...runtimeOptions } = options;
  const root = await mkdtemp(path.join(tmpdir(), 'dotcode-runtime-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'managed');
  const home = path.join(root, 'home');
  await mkdir(directory);
  await mkdir(home);
  await mkdir(path.join(directory, 'runtime'));
  const initialState = JSON.stringify({ services });
  await writeFile(path.join(directory, 'runtime/state.json'), initialState);
  const calls = [];
  let active = 'active';
  const run = async (program, args) => {
    calls.push([program, args]);
    if (args[1] === 'stop') active = 'inactive';
    if (program === 'systemctl') return { stdout: `LoadState=loaded\nActiveState=${active}\nSubState=running\nUnitFileState=enabled\nMainPID=42\n` };
    return { stdout: 'test' };
  };
  const runtime = createRuntime({ directory, home, run, spawnProcess: () => { throw new Error('Unexpected model launch.'); }, ...runtimeOptions });
  return { root, directory, home, calls, runtime, initialState };
}

test('runtime planning never writes; execution uses a single-use server-side plan', async t => {
  const { runtime, calls, directory, initialState } = await fixture(t);
  const plan = await runtime.plan({ kind: 'service', id: '9router', action: 'stop' });
  assert.ok(plan.id);
  assert.equal(calls.length, 0);
  assert.equal(await readFile(path.join(directory, 'runtime/state.json'), 'utf8'), initialState);
  await runtime.execute(plan.id);
  assert.deepEqual(calls[0], ['systemctl', ['--user', 'stop', 'dotcode-9router.service']]);
  await assert.rejects(runtime.execute(plan.id), /expired|used/);
});

async function removalFixture(t, failure) {
  const calls = [];
  let running = true;
  let autostart = true;
  let installed = true;
  const setup = await fixture(t, { run: async (program, args) => {
    calls.push(args[1]);
    if (args[1] === failure) throw new Error(`${failure} failed`);
    if (args[1] === 'stop' && failure !== 'running') running = false;
    if (args[1] === 'disable' && failure !== 'enabled') autostart = false;
    if (args[1] === 'daemon-reload' && failure !== 'loaded') installed = false;
    return { stdout: `LoadState=${installed ? 'loaded' : 'not-found'}\nActiveState=${running ? 'active' : 'inactive'}\nUnitFileState=${autostart ? 'enabled' : 'disabled'}\n` };
  } });
  const unit = path.join(setup.directory, 'runtime/units/dotcode-9router.service');
  const data = path.join(setup.directory, 'services/9router/credentials');
  await mkdir(path.dirname(unit), { recursive: true });
  await mkdir(path.dirname(data), { recursive: true });
  await writeFile(unit, 'owned unit');
  await writeFile(data, 'keep credentials');
  return { ...setup, calls, unit, data };
}

test('service removal stops, disables and deletes the managed unit, preserving working data', async t => {
  const { runtime, calls, directory, unit, data, initialState } = await removalFixture(t);
  const plan = await runtime.plan({ kind: 'service', id: '9router', action: 'remove' });
  assert.match(plan.details.join(' '), /stop.*disable/i);
  assert.equal(plan.files[0].remove, true);
  assert.equal(await readFile(path.join(directory, 'runtime/state.json'), 'utf8'), initialState);
  assert.deepEqual(calls, []);
  await runtime.execute(plan.id);
  assert.deepEqual(calls, ['stop', 'disable', 'show', 'daemon-reload', 'show']);
  const saved = JSON.parse(await readFile(path.join(directory, 'runtime/state.json'), 'utf8'));
  assert.deepEqual(saved.services.map(service => service.id), ['headroom']);
  await assert.rejects(readFile(unit), { code: 'ENOENT' });
  assert.equal(await readFile(data, 'utf8'), 'keep credentials');
  const backups = await readdir(path.join(directory, 'runtime/backups'));
  assert.equal(await readFile(path.join(directory, 'runtime/backups', backups.find(name => name.endsWith('dotcode-9router.service'))), 'utf8'), 'owned unit');
  assert.ok(!(await runtime.snapshot()).services.some(service => service.id === '9router'));
  await assert.rejects(runtime.execute(plan.id), /expired|used/);
});

test('service removal rejects external units even after takeover', async t => {
  for (const adopted of [false, true]) {
    const { runtime, calls } = await fixture(t, { services: [{ id: 'external', name: 'External', unit: 'external.service', external: true, adopted, port: 9000 }] });
    await assert.rejects(runtime.plan({ kind: 'service', id: 'external', action: 'remove' }), /external.*Move to DotCode/i);
    assert.deepEqual(calls, []);
  }
});

test('failed service removal keeps the entry and credentials', async t => {
  for (const failure of ['stop', 'disable', 'running', 'enabled', 'daemon-reload', 'loaded']) {
    const { runtime, directory, unit, data, initialState } = await removalFixture(t, failure);
    const plan = await runtime.plan({ kind: 'service', id: '9router', action: 'remove' });
    await assert.rejects(runtime.execute(plan.id), /failed|could not/i);
    assert.equal(await readFile(path.join(directory, 'runtime/state.json'), 'utf8'), initialState);
    assert.equal(await readFile(data, 'utf8'), 'keep credentials');
    if (['stop', 'disable', 'running', 'enabled'].includes(failure)) assert.equal(await readFile(unit, 'utf8'), 'owned unit');
  }
});

test('service removal rejects stale plans without losing entries', async t => {
  const { runtime, directory, initialState } = await removalFixture(t);
  const plan = await runtime.plan({ kind: 'service', id: '9router', action: 'remove' });
  const changed = JSON.stringify({ ...JSON.parse(initialState), endpoint: 'changed' });
  await writeFile(path.join(directory, 'runtime/state.json'), changed);
  await assert.rejects(runtime.execute(plan.id), /settings changed/);
  assert.equal(await readFile(path.join(directory, 'runtime/state.json'), 'utf8'), changed);
});

test('service removal rejects changed unit files and foreign registration links', async t => {
  const { runtime, directory, home, unit, calls } = await removalFixture(t);
  const plan = await runtime.plan({ kind: 'service', id: '9router', action: 'remove' });
  await writeFile(unit, 'changed unit');
  await assert.rejects(runtime.execute(plan.id), /Target file changed/);
  const foreign = path.join(home, 'foreign.service');
  await writeFile(foreign, 'not owned');
  const registration = path.join(home, '.config/systemd/user/dotcode-9router.service');
  await mkdir(path.dirname(registration), { recursive: true });
  await symlink(foreign, registration);
  await assert.rejects(runtime.plan({ kind: 'service', id: '9router', action: 'remove' }), /different unit/);
  assert.deepEqual(calls, []);
  assert.equal(await readFile(foreign, 'utf8'), 'not owned');
  await rm(registration);
  const collision = await runtime.plan({ kind: 'service', id: '9router', action: 'remove' });
  await symlink(foreign, registration);
  await assert.rejects(runtime.execute(collision.id), /different unit/);
  assert.deepEqual(calls, []);
  await rm(registration);
  await rm(path.join(directory, 'runtime/units'), { recursive: true });
  await symlink(home, path.join(directory, 'runtime/units'));
  await assert.rejects(runtime.plan({ kind: 'service', id: '9router', action: 'remove' }), /symlink/);
});

test('runtime rejects arbitrary services, stale plans, traversal and symlink escapes', async t => {
  const { runtime, directory, root } = await fixture(t);
  await assert.rejects(runtime.plan({ kind: 'service', id: '../other', action: 'stop' }));
  await assert.rejects(runtime.plan({ kind: 'service', id: '9router', action: 'shell' }));
  await assert.rejects(runtime.plan({ kind: 'model', action: 'remove', fileName: '../outside.gguf' }));
  const plan = await runtime.plan({ kind: 'backend', backend: 'llama.cpp', endpoint: '' });
  await mkdir(path.join(directory, 'runtime'), { recursive: true });
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

test('services come only from workspace data, with no built-ins or vault lookups', async t => {
  const { runtime, directory, home } = await fixture(t, { services: [] });
  await mkdir(path.join(home, '.config/systemd/user'), { recursive: true });
  await writeFile(path.join(home, '.config/systemd/user/thinking-os-srv-headroom.service'), 'unregistered unit');
  assert.deepEqual((await runtime.snapshot()).services, []);
  await rm(path.join(directory, 'runtime/state.json'));
  assert.deepEqual((await runtime.snapshot()).services, []);
  await assert.rejects(readFile(path.join(directory, 'runtime/state.json')), { code: 'ENOENT' });
  await assert.rejects(runtime.plan({ kind: 'service', id: '9router', action: 'stop' }), /Unknown/);
});

test('service snapshots show actual systemd commands for arbitrary workspace services', async t => {
  const configured = { id: 'future-api', name: 'Future API', port: 9200, unit: 'my-future-api.service', external: true, adopted: true };
  const { runtime, directory, initialState } = await fixture(t, { services: [configured], run: async () => ({ stdout: 'LoadState=loaded\nActiveState=active\nUnitFileState=enabled\nMainPID=42\nExecStart={ path=/usr/bin/env ; argv[]=/usr/bin/env bash /home/test/api.sh --key=value ; ignore_errors=no ; }\nWorkingDirectory=/home/test\n' }) });
  const snapshot = await runtime.snapshot();
  assert.equal(snapshot.services.length, 1);
  const service = snapshot.services[0];
  assert.equal(service.id, configured.id);
  assert.equal(service.command, '/usr/bin/env bash /home/test/api.sh --key=value');
  assert.equal(service.workingDirectory, '/home/test');
  assert.equal(service.running, true);
  assert.equal(await readFile(path.join(directory, 'runtime/state.json'), 'utf8'), initialState);
});

test('Thinking OS wrappers expose their service command without executing or changing files', async t => {
  let launchCommand;
  const { runtime, home, calls, directory, initialState } = await fixture(t, { run: async (program, args) => {
    calls.push([program, args]);
    return { stdout: `LoadState=loaded\nActiveState=active\nExecStart={ argv[]=${launchCommand} ; ignore_errors=no ; }\nWorkingDirectory=/\n` };
  } });
  const script = path.join(home, '.local/share/thinking-os/services/srv-headroom.sh');
  await mkdir(path.dirname(script), { recursive: true });
  launchCommand = `/usr/bin/env bash ${script}`;
  const command = 'docker run --rm \\\n  --publish 127.0.0.1:8787:8787 example/headroom:code';
  const content = `#!/usr/bin/env bash\nset -e\ncd -- '/workspace/research'"'"'s tools'\nexport PATH='/private/path'\n${command}\n`;
  await writeFile(script, content);
  const service = (await runtime.snapshot()).services.find(service => service.id === 'headroom');
  assert.equal(service.command, launchCommand);
  assert.equal(service.scriptCommand, command);
  assert.equal(service.scriptWorkingDirectory, "/workspace/research's tools");
  assert.equal(service.workingDirectory, '/');
  assert.ok(!JSON.stringify(service).includes('/private/path'));
  assert.ok(calls.every(([program, args]) => program === 'systemctl' && args[1] === 'show'));
  assert.equal(await readFile(script, 'utf8'), content);
  assert.equal(await readFile(path.join(directory, 'runtime/state.json'), 'utf8'), initialState);
});

test('Thinking OS command display falls back for unavailable, unrecognized or unsafe wrappers', async t => {
  for (const scenario of ['missing', 'malformed', 'oversized', 'symlink', 'symlink-directory', 'different-command']) {
    await t.test(scenario, async t => {
      let launchCommand;
      const { runtime, home, root } = await fixture(t, { run: async () => ({ stdout: `LoadState=loaded\nActiveState=active\nExecStart={ argv[]=${launchCommand} ; ignore_errors=no ; }\n` }) });
      const folder = path.join(home, '.local/share/thinking-os/services');
      await mkdir(folder, { recursive: true });
      const script = path.join(folder, 'srv-headroom.sh');
      const content = '#!/usr/bin/env bash\nset -e\ncd -- \'/workspace\'\nexport PATH=\'/bin\'\ndocker run example/headroom\n';
      if (scenario === 'symlink' || scenario === 'symlink-directory') {
        const target = path.join(root, 'outside');
        if (scenario === 'symlink-directory') {
          await mkdir(target);
          await writeFile(path.join(target, 'srv-headroom.sh'), content);
          await rm(folder, { recursive: true });
          await symlink(target, folder);
        } else {
          await writeFile(target, content);
          await symlink(target, script);
        }
      } else if (scenario !== 'missing') await writeFile(script, scenario === 'malformed' ? 'echo custom wrapper\n' : scenario === 'oversized' ? content + 'x'.repeat(65536) : content);
      launchCommand = `/usr/bin/env bash ${script}${scenario === 'different-command' ? ' --extra' : ''}`;
      const service = (await runtime.snapshot()).services.find(service => service.id === 'headroom');
      assert.equal(service.command, launchCommand);
      assert.equal(service.scriptCommand, undefined);
      assert.equal(service.scriptWorkingDirectory, undefined);
      assert.equal(service.running, true);
      assert.equal(service.error, undefined);
    });
  }
});

async function migrationFixture(t, { running = true, autostart = true, failStart = false } = {}) {
  let launchCommand;
  const statuses = { 'thinking-os-srv-headroom.service': { running, autostart }, 'dotcode-headroom.service': { running: false, autostart: false } };
  const calls = [];
  const setup = await fixture(t, { services: [{ id: 'headroom', name: 'Headroom', port: 8787, unit: 'thinking-os-srv-headroom.service', external: true, adopted: false }], run: async (program, args) => {
    calls.push([program, args]);
    const action = args[1];
    const unit = args.find(arg => Object.hasOwn(statuses, arg));
    const status = statuses[unit];
    if (action === 'show') return { stdout: `LoadState=loaded\nActiveState=${status.running ? 'active' : 'inactive'}\nUnitFileState=${status.autostart ? 'enabled' : 'disabled'}\nExecStart={ argv[]=${launchCommand} ; ignore_errors=no ; }\n` };
    if (action === 'start' && unit === 'dotcode-headroom.service' && failStart) throw new Error('New service failed to start');
    if (action === 'start') status.running = true;
    if (action === 'stop') status.running = false;
    if (action === 'enable') status.autostart = true;
    if (action === 'disable') { status.autostart = false; if (args.includes('--now')) status.running = false; }
    return { stdout: '' };
  } });
  const script = path.join(setup.home, '.local/share/thinking-os/services/srv-headroom.sh');
  await mkdir(path.dirname(script), { recursive: true });
  const shellCommand = 'docker run --rm --name existing-container --mount type=volume,source=existing-data,target=/data --mount type=bind,source="$PWD",target=/workspace example/headroom';
  const content = `#!/usr/bin/env bash\nset -e\ncd -- '/old/application/source'\nexport PATH='/bin'\n${shellCommand}\n`;
  await writeFile(script, content);
  launchCommand = `/usr/bin/env bash ${script}`;
  return { ...setup, calls, statuses, script, shellCommand, content };
}

test('service migration owns the command and folder while preserving running state, autostart and external data', async t => {
  const { runtime, directory, home, initialState, calls, statuses, script, shellCommand, content } = await migrationFixture(t);
  const plan = await runtime.plan({ kind: 'service-migrate', id: 'headroom' });
  assert.ok(calls.every(([, args]) => args[1] === 'show'));
  assert.equal(await readFile(path.join(directory, 'runtime/state.json'), 'utf8'), initialState);
  assert.match(plan.files[0].content, /WorkingDirectory=.*services\/headroom/);
  assert.equal(plan.files[0].content.split('\n').find(line => line.startsWith('WorkingDirectory=')), `WorkingDirectory=${directory}/services/headroom`);
  assert.ok(!plan.files[0].content.includes('/old/application/source'));
  assert.ok(plan.files[0].content.includes(`HOME=${home}`));
  assert.match(plan.files[0].content, /existing-data/);
  await runtime.execute(plan.id);
  const service = (await runtime.snapshot()).services[0];
  assert.equal(service.external, false);
  assert.equal(service.adopted, true);
  assert.equal(service.unit, 'dotcode-headroom.service');
  assert.equal(service.shellCommand, shellCommand);
  assert.equal(service.running, true);
  assert.equal(service.autostart, true);
  assert.deepEqual(statuses['thinking-os-srv-headroom.service'], { running: false, autostart: false });
  assert.equal(await readFile(script, 'utf8'), content);
  assert.ok(calls.findIndex(([, args]) => args[1] === 'stop') < calls.findIndex(([, args]) => args[1] === 'start'));
  const update = await runtime.plan({ kind: 'service-update', id: 'headroom', name: 'Headroom', port: 8787, shellCommand: 'docker run --env VALUE="$HOME %test" example/headroom:new' });
  assert.match(update.files[0].content, /\$\$HOME %%test/);
  calls.length = 0;
  await runtime.execute(update.id);
  assert.equal(calls.length, 0, 'editing a running service requires an explicit restart to apply');
  assert.equal((await runtime.snapshot()).services[0].shellCommand, 'docker run --env VALUE="$HOME %test" example/headroom:new');
});

test('service migration preserves running and autostart states independently', async t => {
  for (const [running, autostart] of [[false, false], [true, false], [false, true]]) await t.test(`${running}/${autostart}`, async t => {
    const { runtime, statuses } = await migrationFixture(t, { running, autostart });
    await runtime.execute((await runtime.plan({ kind: 'service-migrate', id: 'headroom' })).id);
    assert.deepEqual(statuses['dotcode-headroom.service'], { running, autostart });
  });
});

test('service migration rejects stale scripts and status before stopping anything', async t => {
  for (const change of ['script', 'status']) await t.test(change, async t => {
    const { runtime, calls, script, statuses } = await migrationFixture(t);
    const plan = await runtime.plan({ kind: 'service-migrate', id: 'headroom' });
    if (change === 'script') await writeFile(script, 'echo changed');
    else statuses['thinking-os-srv-headroom.service'].running = false;
    calls.length = 0;
    await assert.rejects(runtime.execute(plan.id), /changed/i);
    assert.ok(calls.every(([, args]) => args[1] === 'show'));
  });
});

test('failed service migration restores the old service without changing its registration in state', async t => {
  const { runtime, directory, initialState, statuses } = await migrationFixture(t, { failStart: true });
  await assert.rejects(runtime.execute((await runtime.plan({ kind: 'service-migrate', id: 'headroom' })).id), /failed to start/);
  assert.deepEqual(statuses['thinking-os-srv-headroom.service'], { running: true, autostart: true });
  assert.deepEqual(statuses['dotcode-headroom.service'], { running: false, autostart: false });
  assert.equal(await readFile(path.join(directory, 'runtime/state.json'), 'utf8'), initialState);
});

test('service migration rejects unit collisions and unrecognized external commands without mutation', async t => {
  for (const collision of ['unit-file', 'registration', 'wrapper']) await t.test(collision, async t => {
    const { runtime, directory, home, calls, script } = await migrationFixture(t);
    if (collision === 'wrapper') await writeFile(script, 'echo custom command');
    else {
      const target = collision === 'unit-file' ? path.join(directory, 'runtime/units/dotcode-headroom.service') : path.join(home, '.config/systemd/user/dotcode-headroom.service');
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, 'unrelated service');
    }
    await assert.rejects(runtime.plan({ kind: 'service-migrate', id: 'headroom' }), /overwrit|recognized/i);
    assert.ok(calls.every(([, args]) => args[1] === 'show'));
  });
});

test('managed shell commands validate input and encode multiline arguments in a single unit directive', async t => {
  const { runtime, directory } = await fixture(t, { services: [] });
  for (const shellCommand of ['', null, 'x'.repeat(32001), 'echo\0bad']) await assert.rejects(runtime.plan({ kind: 'service-create', name: 'shell-api', port: 9200, shellCommand }));
  await assert.rejects(runtime.plan({ kind: 'service-create', name: 'shell-api', port: 9200, shellCommand: 'echo test', program: process.execPath }), /not both/);
  const shellCommand = 'printf "%s\\n" "$HOME"\nprintf done';
  const plan = await runtime.plan({ kind: 'service-create', name: 'shell-api', port: 9200, shellCommand });
  const directive = plan.files[0].content.split('\n').find(line => line.startsWith('ExecStart='));
  assert.ok(directive.includes('\\nprintf done'));
  assert.ok(directive.includes('$$HOME'));
  await runtime.execute(plan.id);
  assert.equal((await runtime.snapshot()).services[0].shellCommand, shellCommand);
  const service = JSON.parse(await readFile(path.join(directory, 'runtime/state.json'), 'utf8')).services[0];
  assert.equal(service.shellCommand, shellCommand);
  assert.equal(service.program, '/usr/bin/env');
  assert.equal(execFileSync(service.program, ['bash', '-c', 'printf launch-ok'], { encoding: 'utf8', timeout: 5000 }), 'launch-ok');
});

test('service executables retain their symlink name for multicall binaries', async t => {
  const { runtime, root, directory } = await fixture(t, { services: [] });
  const executable = path.join(root, 'env');
  await symlink('/usr/bin/env', executable);
  const args = [process.execPath, '-p', '"launch-ok"'];
  const plan = await runtime.plan({ kind: 'service-create', name: 'multicall', port: 9200, program: executable, args });
  assert.ok(plan.files[0].content.includes(`ExecStart="${executable}"`));
  await runtime.execute(plan.id);
  const service = JSON.parse(await readFile(path.join(directory, 'runtime/state.json'), 'utf8')).services[0];
  assert.equal(service.program, executable);
  assert.equal(execFileSync(service.program, service.args, { encoding: 'utf8', timeout: 5000 }), 'launch-ok\n');
});

test('workspace services reject duplicate identities and invalid systemd units', async t => {
  const { runtime, directory } = await fixture(t, { services: [] });
  const service = { id: 'api', name: 'API', port: 9200, unit: 'custom-api.service', external: true, adopted: true };
  for (const services of [
    {}, [service, service], [service, { ...service, id: 'other' }],
    [{ ...service, unit: '--all' }], [{ ...service, unit: '../api.service' }],
    [{ ...service, external: false }], [{ ...service, external: 'true' }],
  ]) {
    await writeFile(path.join(directory, 'runtime/state.json'), JSON.stringify({ services }));
    await assert.rejects(runtime.snapshot(), /Invalid|Duplicate/);
  }
});

test('autostart toggles verify systemd state and disabling does not stop the service', async t => {
  let autostart = true;
  const { runtime, calls, home } = await fixture(t, { services: [{ id: '9router', name: 'Router', port: 20128, unit: 'thinking-os-srv-9router.service', external: true, adopted: false }], run: async (program, args) => {
    calls.push([program, args]);
    if (args[1] === 'disable') autostart = false;
    if (args[1] === 'enable') autostart = true;
    return { stdout: `LoadState=loaded\nActiveState=active\nUnitFileState=${autostart ? 'enabled' : 'disabled'}\nMainPID=42\n` };
  } });
  await mkdir(path.join(home, '.config/systemd/user'), { recursive: true });
  await writeFile(path.join(home, '.config/systemd/user/thinking-os-srv-9router.service'), 'existing unit');
  await runtime.execute((await runtime.plan({ kind: 'service', id: '9router', action: 'adopt' })).id);
  for (const action of ['disable', 'enable']) {
    await runtime.execute((await runtime.plan({ kind: 'service', id: '9router', action })).id);
    const service = (await runtime.snapshot()).services.find(service => service.id === '9router');
    assert.equal(service.autostart, action === 'enable');
    assert.equal(service.running, true);
  }
  assert.ok(calls.some(([, args]) => args[1] === 'disable'));
  assert.ok(calls.every(([, args]) => args[1] !== 'stop'));
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

test('service metadata edits roundtrip workspace services and external units without takeover or commands', async t => {
  const { runtime, directory, home, calls } = await fixture(t);
  await mkdir(path.join(home, '.config/systemd/user'), { recursive: true });
  const oldUnit = path.join(home, '.config/systemd/user/thinking-os-srv-headroom.service');
  await writeFile(oldUnit, 'untouched external unit');
  for (const [id, name, port, description] of [
    ['9router', 'My Router', 21000, 'Updated router'],
    ['headroom', 'External Proxy', 8800, ''],
  ]) {
    const plan = await runtime.plan({ kind: 'service-update', id, name, port, description });
    assert.deepEqual(plan.files, []);
    assert.match(plan.details.join('\n'), /metadata|display/i);
    await runtime.execute(plan.id);
  }
  assert.equal(calls.length, 0);
  const reloaded = createRuntime({ directory, home, run: async () => ({ stdout: '' }) });
  const snapshot = await reloaded.snapshot();
  const router = snapshot.services.find(service => service.id === '9router');
  assert.equal(router.name, 'My Router');
  assert.equal(router.port, 21000);
  assert.equal(router.description, 'Updated router');
  assert.equal(router.program, undefined);
  assert.equal(router.unit, 'dotcode-9router.service');
  const external = snapshot.services.find(service => service.id === 'headroom');
  assert.equal(external.name, 'External Proxy');
  assert.equal(external.port, 8800);
  assert.equal(external.description, '');
  assert.equal(external.external, true);
  assert.equal(external.adopted, false);
  await assert.rejects(runtime.plan({ kind: 'service-update', id: 'headroom', name: 'Proxy', port: 8800, program: process.execPath }), /external|legacy/i);
  await runtime.execute((await runtime.plan({ kind: 'service', id: 'headroom', action: 'adopt' })).id);
  await assert.rejects(runtime.plan({ kind: 'service-update', id: 'headroom', name: 'Proxy', port: 8800, program: process.execPath }), /external|legacy/i);
  assert.equal(await readFile(oldUnit, 'utf8'), 'untouched external unit');
});

test('service create/update approve exact managed units, preserve executable metadata and back up replacements', async t => {
  const { runtime, directory, home, calls } = await fixture(t);
  const executable = await realpath(process.execPath);
  const created = await runtime.plan({ kind: 'service-create', name: 'local-api', port: 9000, program: process.execPath, args: ['--version'] });
  const unit = path.join(directory, 'runtime/units/dotcode-local-api.service');
  assert.equal(created.files[0].path, unit);
  await assert.rejects(readFile(unit), { code: 'ENOENT' });
  await runtime.execute(created.id);
  const original = await readFile(unit, 'utf8');
  let service = (await runtime.snapshot()).services.find(item => item.id === 'local-api');
  assert.equal(service.program, executable);
  assert.deepEqual(service.args, ['--version']);
  calls.length = 0;
  const update = { kind: 'service-update', id: 'local-api', name: 'Local API v2', description: 'Renamed', port: 9001, program: process.execPath, args: ['--eval', 'console.log("$HOME %value")'] };
  await mkdir(path.join(home, '.config/systemd/user'), { recursive: true });
  const registration = path.join(home, '.config/systemd/user/dotcode-local-api.service');
  await symlink(unit, registration);
  const plan = await runtime.plan(update);
  assert.equal(plan.files[0].path, unit);
  assert.match(plan.files[0].content, /ExecStart=/);
  assert.match(plan.files[0].content, /\$\$HOME %%value/);
  assert.match(plan.details.join('\n'), /no.*restart|not.*restart/i);
  assert.equal(await readFile(unit, 'utf8'), original);
  await runtime.execute(plan.id);
  assert.equal(await readFile(unit, 'utf8'), plan.files[0].content);
  assert.equal(calls.length, 0);
  const backups = await readdir(path.join(directory, 'runtime/backups'));
  const backup = backups.find(name => name.endsWith('dotcode-local-api.service'));
  assert.ok(backup);
  assert.equal(await readFile(path.join(directory, 'runtime/backups', backup), 'utf8'), original);
  service = (await createRuntime({ directory, home, run: async () => ({ stdout: '' }) }).snapshot()).services.find(item => item.id === 'local-api');
  assert.equal(service.id, 'local-api');
  assert.equal(service.name, 'Local API v2');
  assert.equal(service.port, 9001);
  assert.equal(service.description, 'Renamed');
  assert.equal(service.program, executable);
  assert.deepEqual(service.args, update.args);
  assert.equal(service.unit, 'dotcode-local-api.service');
  assert.equal(service.external, false);
  assert.equal(service.adopted, true);
  const metadata = await runtime.plan({ kind: 'service-update', id: 'local-api', name: 'Metadata only', port: 9002 });
  assert.deepEqual(metadata.files, []);
  await runtime.execute(metadata.id);
  assert.equal(await readFile(unit, 'utf8'), plan.files[0].content);
  const retained = (await runtime.snapshot()).services.find(item => item.id === 'local-api');
  assert.equal(retained.description, 'Renamed');
  assert.deepEqual(retained.args, update.args);
  const stale = await runtime.plan(update);
  await writeFile(unit, 'independent edit');
  await assert.rejects(runtime.execute(stale.id), /changed/);
  assert.equal(await readFile(unit, 'utf8'), 'independent edit');
  const staleState = await runtime.plan(update);
  await runtime.execute((await runtime.plan({ kind: 'service-update', id: 'local-api', name: 'Other edit', port: 9003 })).id);
  await assert.rejects(runtime.execute(staleState.id), /settings changed/);
  const staleRegistration = await runtime.plan(update);
  await rm(registration);
  await writeFile(registration, 'different unit');
  await assert.rejects(runtime.execute(staleRegistration.id), /different unit|overwritten/);
  await assert.rejects(runtime.plan(update), /different unit|overwritten/);
  assert.equal(await readFile(registration, 'utf8'), 'different unit');
  assert.equal(await readFile(unit, 'utf8'), 'independent edit');
});

test('service editing validates metadata and executable inputs; creation never overwrites destinations', async t => {
  const { runtime, directory, home, calls, initialState } = await fixture(t);
  const request = { kind: 'service-update', id: '9router', name: 'Router', port: 9000 };
  for (const invalid of [
    { id: 'unknown' }, { name: '' }, { name: 'x'.repeat(101) }, { description: 'x'.repeat(501) },
    { description: null }, { description: '\0' }, { port: 1023 }, { port: 65536 }, { port: 9000.5 },
    { program: '' }, { program: '/missing/dotcode-executable' }, { program: 'node\n--eval' },
    { program: process.execPath, args: ['bad\nargument'] }, { program: process.execPath, args: 'not an array' },
  ]) await assert.rejects(runtime.plan({ ...request, ...invalid }));
  const plan = await runtime.plan({ ...request, program: process.execPath, args: [] });
  assert.equal(calls.length, 0);
  assert.equal(await readFile(path.join(directory, 'runtime/state.json'), 'utf8'), initialState);
  await assert.rejects(readFile(plan.files[0].path), { code: 'ENOENT' });
  await runtime.execute(plan.id);
  assert.equal((await runtime.snapshot()).services.find(service => service.id === '9router').program, await realpath(process.execPath));
  const create = { kind: 'service-create', name: 'another', port: 9000, program: process.execPath, args: [] };
  const collision = await runtime.plan(create);
  await writeFile(collision.files[0].path, 'unmanaged destination');
  await assert.rejects(runtime.execute(collision.id), /changed/);
  await assert.rejects(runtime.plan(create), /exists|overwritten/);
  await assert.rejects(runtime.plan({ ...create, name: '9router' }), /already/);
  const lateRegistration = await runtime.plan({ ...create, name: 'late-registration' });
  const registration = path.join(home, '.config/systemd/user/dotcode-late-registration.service');
  await mkdir(path.dirname(registration), { recursive: true });
  await writeFile(registration, 'external registration');
  await assert.rejects(runtime.execute(lateRegistration.id), /exists|replaced|overwritten/);
  assert.equal(await readFile(registration, 'utf8'), 'external registration');
  await assert.rejects(readFile(lateRegistration.files[0].path), { code: 'ENOENT' });
});

test('per-file model settings persist across reload; start defaults and runtime port stay independent', async t => {
  const { runtime, directory, home, calls, initialState } = await fixture(t);
  await mkdir(path.join(directory, 'models'));
  for (const name of ['model.gguf', 'other.gguf', 'mmproj.gguf']) await writeFile(path.join(directory, 'models', name), 'GGUF-test');
  await mkdir(path.join(home, 'LOCAL-AI-MODELS'));
  await writeFile(path.join(home, 'LOCAL-AI-MODELS/external.gguf'), 'GGUF-test');
  let snapshot = await runtime.snapshot();
  assert.deepEqual(snapshot.models.find(model => model.fileName === 'model.gguf').settings, { port: 8090, contextLength: 4096, gpuLayers: 0 });
  assert.equal(snapshot.importableModels[0].settings, undefined);
  calls.length = 0;
  const settings = { port: 9123, contextLength: 8192, gpuLayers: 17, projector: 'mmproj.gguf' };
  const plan = await runtime.plan({ kind: 'model', action: 'configure', fileName: 'model.gguf', ...settings });
  assert.deepEqual(plan.files, []);
  assert.match(plan.details.join('\n'), /next.*launch|next.*start/i);
  assert.equal(await readFile(path.join(directory, 'runtime/state.json'), 'utf8'), initialState);
  await runtime.execute(plan.id);
  assert.equal(calls.length, 0);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'runtime/state.json'), 'utf8')).modelSettings, { 'model.gguf': settings });
  let invocation;
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => { child.emit('exit', null, 'SIGTERM'); return true; };
  const reloaded = createRuntime({ directory, home, run: async () => ({ stdout: '' }), spawnProcess: (program, args) => { invocation = { program, args }; return child; }, fetchRemote: async () => ({ ok: true }) });
  t.after(() => reloaded.close());
  snapshot = await reloaded.snapshot();
  assert.deepEqual(snapshot.models.find(model => model.fileName === 'model.gguf').settings, settings);
  assert.deepEqual(snapshot.models.find(model => model.fileName === 'other.gguf').settings, { port: 8090, contextLength: 4096, gpuLayers: 0 });
  await reloaded.execute((await reloaded.plan({ kind: 'model', action: 'start', fileName: 'model.gguf' })).id);
  assert.equal(invocation.program, 'llama-server');
  assert.deepEqual(invocation.args, ['--model', path.join(directory, 'models/model.gguf'), '--host', '127.0.0.1', '--port', '9123', '-c', '8192', '-ngl', '17', '--mmproj', path.join(directory, 'models/mmproj.gguf')]);
  const nextSettings = { port: 9124, contextLength: 16384, gpuLayers: 0 };
  await reloaded.execute((await reloaded.plan({ kind: 'model', action: 'configure', fileName: 'model.gguf', ...nextSettings })).id);
  const running = (await reloaded.snapshot()).models.find(model => model.fileName === 'model.gguf');
  assert.equal(running.port, 9123);
  assert.equal(running.status, 'running');
  assert.deepEqual(running.settings, nextSettings);
  await reloaded.execute((await reloaded.plan({ kind: 'model', action: 'stop', fileName: 'model.gguf' })).id);
  await reloaded.execute((await reloaded.plan({ kind: 'model', action: 'start', fileName: 'model.gguf', port: 9200, contextLength: 2048, gpuLayers: 2, projector: 'mmproj.gguf' })).id);
  assert.ok(invocation.args.includes('9200'));
  assert.ok(invocation.args.includes('2048'));
  assert.ok(invocation.args.includes('2'));
  assert.deepEqual((await reloaded.snapshot()).models.find(model => model.fileName === 'model.gguf').settings, nextSettings);
  await reloaded.execute((await reloaded.plan({ kind: 'model', action: 'stop', fileName: 'model.gguf' })).id);
  await reloaded.execute((await reloaded.plan({ kind: 'model', action: 'configure', fileName: 'model.gguf', ...settings })).id);
  await reloaded.execute((await reloaded.plan({ kind: 'model', action: 'start', fileName: 'model.gguf', projector: '' })).id);
  assert.ok(!invocation.args.includes('--mmproj'));
  assert.deepEqual((await reloaded.snapshot()).models.find(model => model.fileName === 'model.gguf').settings, settings);
  await reloaded.execute((await reloaded.plan({ kind: 'model', action: 'stop', fileName: 'model.gguf' })).id);
  await reloaded.execute((await reloaded.plan({ kind: 'model', action: 'remove', fileName: 'model.gguf' })).id);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'runtime/state.json'), 'utf8')).modelSettings, {});
});

test('model configure validates inputs and regular managed files without planning mutations', async t => {
  const { runtime, directory, root, initialState } = await fixture(t);
  await mkdir(path.join(directory, 'models'));
  await writeFile(path.join(directory, 'models/model.gguf'), 'GGUF-test');
  await writeFile(path.join(directory, 'models/invalid.gguf'), 'not GGUF');
  await writeFile(path.join(root, 'outside.gguf'), 'GGUF-test');
  await symlink(path.join(root, 'outside.gguf'), path.join(directory, 'models/escape.gguf'));
  await mkdir(path.join(directory, 'models/directory.gguf'));
  const configure = { kind: 'model', action: 'configure', fileName: 'model.gguf', port: 8090, contextLength: 4096, gpuLayers: 0 };
  for (const invalid of [
    { fileName: '../outside.gguf' }, { fileName: 'escape.gguf' }, { fileName: 'directory.gguf' }, { fileName: 'missing.gguf' }, { fileName: 'invalid.gguf' },
    { port: 1023 }, { port: 65536 }, { port: '8090' }, { contextLength: 511 }, { contextLength: 1048577 },
    { gpuLayers: -1 }, { gpuLayers: 1000 }, { gpuLayers: 0.5 }, { projector: '../outside.gguf' },
    { projector: 'escape.gguf' }, { projector: 'directory.gguf' }, { projector: 'missing.gguf' }, { projector: null },
  ]) await assert.rejects(runtime.plan({ ...configure, ...invalid }));
  const pending = await runtime.plan(configure);
  assert.equal(await readFile(path.join(directory, 'runtime/state.json'), 'utf8'), initialState);
  await runtime.execute((await runtime.plan({ kind: 'backend', backend: 'llama.cpp' })).id);
  await assert.rejects(runtime.execute(pending.id), /changed/);
  const staleModel = await runtime.plan(configure);
  await rm(path.join(directory, 'models/model.gguf'));
  await symlink(path.join(root, 'outside.gguf'), path.join(directory, 'models/model.gguf'));
  await assert.rejects(runtime.execute(staleModel.id), /symlink/);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'runtime/state.json'), 'utf8')).modelSettings, {});
  await rm(path.join(directory, 'models/model.gguf'));
  await writeFile(path.join(directory, 'models/model.gguf'), 'GGUF-test');
  await writeFile(path.join(directory, 'models/mmproj.gguf'), 'GGUF-test');
  const staleProjector = await runtime.plan({ ...configure, projector: 'mmproj.gguf' });
  await rm(path.join(directory, 'models/mmproj.gguf'));
  await symlink(path.join(root, 'outside.gguf'), path.join(directory, 'models/mmproj.gguf'));
  await assert.rejects(runtime.execute(staleProjector.id), /symlink/);
  const staleHeader = await runtime.plan(configure);
  await writeFile(path.join(directory, 'models/model.gguf'), 'not GGUF');
  await assert.rejects(runtime.execute(staleHeader.id), /GGUF/);
});

test('state normalization rejects invalid saved model settings', async t => {
  const { runtime, directory } = await fixture(t);
  await mkdir(path.join(directory, 'runtime'), { recursive: true });
  const defaults = { port: 8090, contextLength: 4096, gpuLayers: 0 };
  for (const modelSettings of [
    [], null, 'invalid', { '../escape.gguf': defaults }, { 'model.gguf': null },
    { 'model.gguf': { ...defaults, port: 1 } }, { 'model.gguf': { ...defaults, contextLength: 0 } },
    { 'model.gguf': { ...defaults, gpuLayers: 1000 } }, { 'model.gguf': { ...defaults, projector: '../escape.gguf' } },
  ]) {
    await writeFile(path.join(directory, 'runtime/state.json'), JSON.stringify({ modelSettings }));
    await assert.rejects(runtime.snapshot());
  }
});

test('expired runtime plans cannot execute', async t => {
  let time = 0;
  const { runtime } = await fixture(t, { now: () => time });
  const plan = await runtime.plan({ kind: 'service', id: '9router', action: 'stop' });
  time = 16 * 60 * 1000;
  await assert.rejects(runtime.execute(plan.id), /expired/);
});
