import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, readFile, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { attachApi } from '../backend/api.mjs';

const attachAgent = attachApi;

const url = 'https://github.com/example/tool';

test('all HTTP write routes require a local Host, same Origin if present, and JSON', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-write-'));
  const app = express();
  attachApi(app, { directory });
  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  await new Promise(resolve => server.once('listening', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const write = (method, route, headers = {}, body = '{"items":[]}') => new Promise((resolve, reject) => {
    const req = request(base + route, { method, headers: { 'content-type': 'application/json', ...headers } }, res => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end(body);
  });
  for (const [method, route] of [
    ['PUT', '/api/catalog'], ['POST', '/api/catalog/cards'], ['POST', '/api/installer/detect'],
    ['POST', '/api/installer/plan'], ['POST', '/api/installer/execute'],
  ]) {
    for (const headers of [
      { host: 'example.test', 'x-forwarded-host': `127.0.0.1:${port}` },
      { host: `127.0.0.1:${port}/path` },
      { origin: 'http://127.0.0.1' }, { origin: `https://127.0.0.1:${port}` },
      { origin: `http://localhost:${port}` }, { origin: `${base}/path` },
      { origin: 'null' }, { origin: '' }, { origin: base, 'sec-fetch-site': 'cross-site' },
    ]) {
      assert.equal(await write(method, route, headers), 403, `${method} ${route}: ${JSON.stringify(headers)}`);
    }
    assert.equal(await write(method, route, { 'content-type': 'text/plain' }), 415, `${method} ${route}`);
  }
  assert.equal(await write('PUT', '/api/catalog', { host: 'example.test' }, '{'), 403);
  assert.deepEqual(await (await fetch(`${base}/api/catalog`)).json(), { items: null });
  assert.equal(await write('PUT', '/api/catalog', { origin: base }), 200);
  assert.deepEqual(await (await fetch(`${base}/api/catalog`)).json(), { items: [] });
});

test('catalog persists as validated JSON outside app source', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-catalog-'));
  const app = express().use(express.json());
  attachAgent(app, { directory });
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

test('update checks fetch only cataloged GitHub repositories', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-updates-'));
  const requests = [];
  let upstreamStatus = 200;
  let release = { tag_name: 'v1.3.0', body: 'Notes', draft: false, prerelease: false };
  const app = express().use(express.json());
  attachAgent(app, { directory, fetchRelease: async (target, options) => {
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

