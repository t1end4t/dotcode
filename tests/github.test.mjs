import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInstaller } from '../installer.mjs';
import express from 'express';
import { attachAgent } from '../agent.mjs';

const commit = 'a'.repeat(40);
const metadata = { full_name: 'example/review', name: 'review', description: 'Review code.', language: 'TypeScript', stargazers_count: 42, topics: ['code-review'], owner: { avatar_url: 'https://avatars.githubusercontent.com/u/42?v=4' } };
async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-search-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const requests = [];
  const installer = createInstaller({ directory, env: {}, run: async () => ({ stdout: '' }), fetchRemote: async (url, options) => {
    requests.push([url, options]);
    const body = url.includes('/search/') ? { items: [metadata] }
      : url.includes('/commits/') ? { sha: commit }
      : url.includes('/git/trees/') ? { tree: [{ path: 'SKILL.md', type: 'blob', mode: '100644' }] }
      : url.endsWith('/releases/latest') ? { published_at: '2026-11-20T12:00:00Z', assets: [] } : metadata;
    return Response.json(body);
  }, ...options });
  return { installer, requests, directory };
}

test('search returns repository metadata, release date, Detector badges and an anonymous warning', async t => {
  const { installer, requests } = await fixture(t);
  const result = await installer.search('code review');
  assert.match(result.warning, /No GitHub token/);
  assert.equal(result.results.length, 1);
  const card = result.results[0];
  assert.equal(card.repo, 'example/review');
  assert.equal(card.stars, 42);
  assert.equal(card.primaryLanguage, 'TypeScript');
  assert.equal(card.description, 'Review code.');
  assert.equal(card.latestReleaseAt, '2026-11-20T12:00:00Z');
  assert.deepEqual(card.detection.badges, ['Skill']);
  assert.deepEqual(card.detection.skillPaths, ['']);
  assert.equal(card.detection.commit, commit);
  assert.ok(Number.isFinite(Date.parse(card.detection.checkedAt)));
  assert.equal(card.category, 'Skills');
  assert.equal(card.iconUrl, 'https://avatars.githubusercontent.com/u/42?v=4');
  assert.ok(requests.every(([url, options]) => new URL(url).origin === 'https://api.github.com' && options.redirect === 'error'));
});

test('repository URLs return exactly one result and invalid URLs never reach GitHub', async t => {
  const { installer, requests } = await fixture(t);
  assert.equal((await installer.search('https://github.com/Example/Review.git/')).results.length, 1);
  assert.ok(!requests.some(([url]) => url.includes('/search/')));
  const before = requests.length;
  for (const url of ['https://example.com/repo', 'https://github.com/a/b/issues', 'https://user:secret@github.com/a/b', 'http://github.com/a/b', 'https://github.com/a/..', 'https://github.com/a/b?token=secret', 'git@github.com:owner/repo.git', '//github.com/owner/repo']) {
    await assert.rejects(installer.search(url), /GitHub repository URL/);
  }
  assert.equal(requests.length, before);
  await installer.search('language:TypeScript');
  assert.ok(requests.some(([url]) => url.includes('q=language%3ATypeScript')));
  await installer.search('repo:example/review');
  assert.ok(requests.some(([url]) => url.includes('q=repo%3Aexample%2Freview')));
});

test('an undetectable repository keeps its metadata and does not hide healthy search results', async t => {
  const { installer } = await fixture(t, { fetchRemote: async url => {
    if (url.includes('/search/')) return Response.json({ items: [metadata, { ...metadata, full_name: 'example/empty', description: 'An empty repository.' }] });
    if (url.includes('/repos/example/empty/commits/')) return new Response(null, { status: 409 });
    if (url.includes('/commits/')) return Response.json({ sha: commit });
    if (url.includes('/git/trees/')) return Response.json({ tree: [{ path: 'SKILL.md', type: 'blob', mode: '100644' }] });
    if (url.includes('/releases/')) return new Response(null, { status: 404 });
    return Response.json({ ...metadata, full_name: 'example/empty', description: 'An empty repository.' });
  } });
  const { results } = await installer.search('review');
  assert.equal(results.length, 2);
  assert.deepEqual(results[0].detection.badges, ['Skill']);
  assert.deepEqual(results[1].detection.badges, ['Unknown']);
  assert.match(results[1].detection.error, /GitHub request failed/);
  assert.equal(results[1].description, 'An empty repository.');
  assert.equal((await installer.search('https://github.com/example/empty')).results.length, 1);
});

test('credentials prefer the environment, fall back to gh, and never enter results or errors', async t => {
  for (const useEnvironment of [true, false]) {
    let ghCalls = 0;
    const headers = [];
    const { installer } = await fixture(t, {
      env: useEnvironment ? { GITHUB_TOKEN: 'env-secret' } : { GH_HOST: 'github.example.com' },
      run: async (program, args) => { ghCalls++; assert.equal(program, 'gh'); assert.deepEqual(args, ['auth', 'token', '--hostname', 'github.com']); return { stdout: 'gh-secret\n' }; },
      fetchRemote: async (url, options) => {
        assert.equal(new URL(url).origin, 'https://api.github.com');
        headers.push(options.headers.authorization);
        return Response.json({ items: [] });
      },
    });
    assert.deepEqual(await installer.search('review'), { results: [], warning: '' });
    assert.equal(ghCalls, useEnvironment ? 0 : 1);
    assert.deepEqual(headers, [useEnvironment ? 'Bearer env-secret' : 'Bearer gh-secret']);
    assert.doesNotMatch(JSON.stringify(await installer.snapshot()), /env-secret|gh-secret/);
  }
  for (const status of [403, 429]) {
    const { installer } = await fixture(t, { fetchRemote: async () => new Response('env-secret', { status }) });
    await assert.rejects(installer.search('review'), /GitHub rate limit/);
  }
  const { installer } = await fixture(t, { env: { GITHUB_TOKEN: 'env-secret' }, fetchRemote: async () => { throw new Error('request headers: env-secret'); } });
  await assert.rejects(installer.search('review'), error => !error.message.includes('env-secret') && /connection/.test(error.message));
});

test('Detector badges use manifests, release assets and topics, including unknown repositories and absent releases', async t => {
  for (const scenario of [
    { paths: ['flake.nix'], badges: ['Nix flake'], category: 'Developer tools' },
    { paths: ['package.json'], pkg: { bin: { tool: 'cli.js' } }, badges: ['npm CLI'], category: 'Developer tools' },
    { paths: ['package.json'], pkg: { dependencies: { '@modelcontextprotocol/sdk': '1' } }, badges: ['MCP'], category: 'MCP servers' },
    { paths: [], topics: ['mcp-server'], badges: ['MCP'], category: 'MCP servers' },
    { paths: [], assets: [{ name: 'tool.AppImage' }], badges: ['AppImage'], category: 'Desktop apps' },
    { paths: [], topics: ['security'], badges: ['Unknown'], category: 'security', noRelease: true },
  ]) {
    const { installer } = await fixture(t, { fetchRemote: async url => {
      if (url.includes('/commits/')) return Response.json({ sha: commit });
      if (url.includes('/git/trees/')) return Response.json({ tree: scenario.paths.map(file => ({ path: file, type: 'blob', mode: '100644' })) });
      if (url.includes('/contents/')) return Response.json({ content: Buffer.from(JSON.stringify(scenario.pkg)).toString('base64') });
      if (url.includes('/releases/')) return scenario.noRelease ? new Response(null, { status: 404 }) : Response.json({ assets: scenario.assets ?? [] });
      return Response.json({ ...metadata, topics: scenario.topics ?? [] });
    } });
    const { results: [result] } = await installer.search('https://github.com/example/review');
    assert.deepEqual(result.detection.badges, scenario.badges);
    assert.equal(result.category, scenario.category);
    assert.equal(result.latestReleaseAt, null);
  }
});

test('HTTP Add persists Detector metadata, deduplicates canonical repos and never calls AI', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-add-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let offline = false;
  const app = express().use(express.json());
  const stop = attachAgent(app, { directory, createCodex: () => { throw new Error('AI must not be called'); }, installerOptions: {
    env: { GITHUB_TOKEN: 'http-test-secret' }, run: async () => ({ stdout: '' }), fetchRemote: async url => {
      if (offline) throw new Error('GitHub became unavailable after search');
      return Response.json(url.includes('/search/') ? { items: [metadata] } : url.includes('/commits/') ? { sha: commit }
        : url.includes('/git/trees/') ? { tree: [{ path: 'SKILL.md', type: 'blob', mode: '100644' }] }
        : url.endsWith('/releases/latest') ? { published_at: '2026-11-20T12:00:00Z', assets: [] } : metadata);
    },
  } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await stop(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const add = githubUrl => fetch(base + '/api/catalog/cards', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ githubUrl }) });
  const search = await fetch(base + '/api/installer/search?q=review');
  assert.equal(search.status, 200);
  assert.equal(search.headers.get('cache-control'), 'no-store');
  assert.equal((await search.json()).results[0].repo, 'example/review');
  offline = true;
  const response = await add('https://github.com/Example/Review.git/');
  assert.equal(response.status, 201);
  const { item } = await response.json();
  assert.equal(item.category, 'Skills');
  assert.equal(item.iconUrl, 'https://avatars.githubusercontent.com/u/42?v=4');
  assert.deepEqual(item.detection.badges, ['Skill']);
  assert.equal((await add('https://github.com/example/review')).status, 200);
  const saved = await (await fetch(base + '/api/catalog')).json();
  assert.equal(saved.items.length, 1);
  assert.deepEqual(saved.items[0], item);
  assert.doesNotMatch(JSON.stringify(saved), /http-test-secret/);
  assert.doesNotMatch(JSON.stringify(await (await fetch(base + '/api/installer')).json()), /http-test-secret/);
  assert.equal((await add('https://example.com/repo')).status, 400);
  assert.equal((await fetch(base + '/api/catalog/cards', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify({ githubUrl: item.githubUrl }) })).status, 403);
});

test('saved Cards preserve explicit Kind and GitHub icons and reject unsupported metadata', async t => {
  const { installer, directory } = await fixture(t);
  const card = { ...await installer.inspect('https://github.com/example/review'), kind: 'desktop-app', iconUrl: 'https://raw.githubusercontent.com/example/review/main/icon.png' };
  const app = express().use(express.json());
  const stop = attachAgent(app, { directory });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await stop(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const save = item => fetch(base + '/api/catalog', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [item] }) });
  for (const invalid of [
    { ...card, kind: 'anything' },
    ...['javascript:alert(1)', 'https://example.com/icon.png', 'https://raw.githubusercontent.com.evil.test/icon.png', 'https://user:secret@raw.githubusercontent.com/example/review/main/icon.png'].map(iconUrl => ({ ...card, iconUrl })),
  ]) {
    assert.equal((await save(invalid)).status, 400);
  }
  assert.equal((await save(card)).status, 200);
  assert.deepEqual((await (await fetch(base + '/api/catalog')).json()).items, [card]);
});

test('Install reuses saved detection for 24 hours, then refreshes and persists it before planning', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-refresh-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let clock = Date.parse('2026-11-21T12:00:00Z');
  let revision = commit;
  const requests = [];
  const app = express().use(express.json());
  const stop = attachAgent(app, { directory, installerOptions: {
    home: directory + '-home', env: {}, now: () => clock, run: async () => ({ stdout: '' }),
    fetchRemote: async url => {
      requests.push(url);
      return Response.json(url.includes('/commits/') ? { sha: revision }
        : url.includes('/git/trees/') ? { tree: [{ path: revision === commit ? 'SKILL.md' : 'skills/review/SKILL.md', type: 'blob', mode: '100644' }] }
        : url.endsWith('/releases/latest') ? { assets: [] } : metadata);
    },
  } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await stop(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post('/api/catalog/cards', { githubUrl: 'https://github.com/example/review' })).status, 201);
  requests.length = 0;
  clock += 24 * 60 * 60 * 1000;
  let response = await post('/api/installer/plan', { action: 'install', githubUrl: 'https://github.com/example/review' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).version, commit);
  assert.equal(requests.length, 0);
  clock++;
  revision = 'b'.repeat(40);
  response = await post('/api/installer/plan', { action: 'install', githubUrl: 'https://github.com/example/review' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).version, revision);
  assert.ok(requests.some(url => url.includes('/commits/')));
  const { items } = await (await fetch(base + '/api/catalog')).json();
  assert.equal(items[0].detection.commit, revision);
  assert.deepEqual(items[0].detection.skillPaths, ['skills/review']);
  assert.equal(items[0].detection.checkedAt, '2026-11-22T12:00:00.001Z');
});
