import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

for (const mode of ['default', 'environment', 'explicit']) {
  test(`agent and runtime data directory: ${mode}`, async t => {
    const root = await mkdtemp(path.join(tmpdir(), 'dotcode-home-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const home = path.join(root, 'home');
    await mkdir(home);
    const env = { ...process.env, HOME: home };
    delete env.DOTCODE_HOME;
    if (mode !== 'default') env.DOTCODE_HOME = path.join(root, 'environment');
    const directory = mode === 'explicit' ? path.join(root, 'explicit') : undefined;
    const expected = directory ?? env.DOTCODE_HOME ?? path.join(home, '.dotcode');
    assert.equal(execFileSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import path from 'node:path';
      import { attachAgent } from './agent.mjs';
      import { createRuntime } from './runtime.mjs';
      const directory = ${JSON.stringify(directory) ?? 'undefined'};
      const expected = ${JSON.stringify(expected)};
      const routes = new Map();
      const stop = attachAgent({ get: (route, handler) => routes.set(route, handler), post() {}, put() {} }, { directory });
      try {
        let response;
        await routes.get('/api/workspace')({ get() {} }, {
          setHeader() {}, status(code) { throw new Error('HTTP ' + code); },
          json(body) { response = body; },
        });
        assert.equal(response.workspace, path.join(expected, 'workspace'));
        const runtime = createRuntime({ directory, run: async () => { throw new Error('Unexpected command.'); } });
        assert.equal((await runtime.snapshot()).directory, expected);
      } finally { await stop(); }
    `], { cwd: new URL('..', import.meta.url), env, encoding: 'utf8', timeout: 15000 }), '');
  });
}
