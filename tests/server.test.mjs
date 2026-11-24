import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { networkInterfaces, tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';

function startServer(t, directory, env) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'backend/server.ts'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: '0', HOST: undefined, DOTCODE_HOME: directory, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = once(child, 'close');
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  t.after(async () => {
    child.kill('SIGKILL');
    await closed;
    await rm(directory, { recursive: true, force: true });
  });
  return async pattern => {
    const deadline = Date.now() + 8000;
    while (!pattern.test(output) && Date.now() < deadline && child.exitCode === null) await setTimeout(50);
    assert.match(output, pattern);
    return output;
  };
}

test('development defaults to 127.0.0.1, opens the browser, and serves HMR', { timeout: 15000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-browser-'));
  const browser = path.join(directory, 'browser.js');
  await writeFile(browser, `
    const url = process.argv.at(-1);
    fetch(url + '/api/health').then(response => {
      if (!response.ok) process.exit(1);
      console.log('BROWSER_OPEN:' + url);
    });
  `);
  const waitFor = startServer(t, directory, { NODE_ENV: 'development', BROWSER: browser });
  const output = await waitFor(/BROWSER_OPEN:http:\/\/127\.0\.0\.1:[1-9]\d*/);
  const opened = output.match(/BROWSER_OPEN:(\S+)/)[1];
  assert.ok(output.includes(`DotCode: ${opened}`));
  await assert.rejects(fetch(opened.replace('127.0.0.1', '127.0.0.2')), error => error.cause?.code === 'ECONNREFUSED');
  const html = await (await fetch(opened)).text();
  assert.match(html, /src="\/src\/main\.tsx"/, "The default app must serve the Library UI.");
  const socket = new WebSocket(opened.replace(/^http/, 'ws'), 'vite-hmr');
  try {
    const [message] = await once(socket, 'message', { signal: AbortSignal.timeout(3000) });
    assert.equal(JSON.parse(message.data).type, 'connected');
    assert.doesNotMatch(output, /WebSocket server error/);
  } finally {
    socket.close();
  }
});

test('explicit HOST exposes the listener but writes still require a loopback peer', { timeout: 15000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-host-'));
  const waitFor = startServer(t, directory, { NODE_ENV: 'production', HOST: '0.0.0.0', APP_URL: 'http://example.test' });
  const output = await waitFor(/DotCode: http:\/\/127\.0\.0\.1:[1-9]\d*/);
  const port = Number(output.match(/DotCode: http:\/\/127\.0\.0\.1:(\d+)/)[1]);
  const local = `http://127.0.0.2:${port}`;
  const peer = Object.values(networkInterfaces()).flat().find(address => address.family === 'IPv4' && !address.internal);
  await t.test('a non-loopback socket cannot write with local headers', { skip: !peer && 'No non-loopback IPv4 interface' }, async () => {
    const status = await new Promise((resolve, reject) => {
      const req = request({ host: peer.address, port, path: '/api/catalog', method: 'PUT', headers: {
        host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`, 'x-forwarded-for': '127.0.0.1', 'content-type': 'application/json',
      } }, res => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end('{"items":[]}');
    });
    assert.equal(status, 403);
  });
  assert.equal((await fetch(`${local}/api/catalog`, {
    method: 'PUT', headers: { 'content-type': 'application/json', origin: local }, body: '{"items":[]}',
  })).status, 200);
});
