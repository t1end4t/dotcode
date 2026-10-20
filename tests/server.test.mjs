import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';

test('development opens the browser at the listening HTTP address', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-browser-'));
  const browser = path.join(directory, 'browser.js');
  await writeFile(browser, `
    const url = process.argv.at(-1);
    fetch(url + '/api/health').then(response => {
      if (!response.ok) process.exit(1);
      console.log('BROWSER_OPEN:' + url);
    });
  `);
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, NODE_ENV: 'development', PORT: '0', DOTCODE_HOME: directory, BROWSER: browser },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = once(child, 'close');
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  try {
    const deadline = Date.now() + 8000;
    while (!output.includes('BROWSER_OPEN:') && Date.now() < deadline && child.exitCode === null) await setTimeout(50);
    assert.match(output, /BROWSER_OPEN:http:\/\/127\.0\.0\.1:[1-9]\d*/);
    const opened = output.match(/BROWSER_OPEN:(\S+)/)[1];
    assert.ok(output.includes(`DotCode: ${opened}`));
  } finally {
    child.kill('SIGKILL');
    await closed;
    await rm(directory, { recursive: true, force: true });
  }
});
