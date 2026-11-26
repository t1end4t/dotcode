import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { networkInterfaces, tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { attachApi } from '../backend/api.mjs';

const commit = 'a'.repeat(40);
let stall = null;
let stalled = () => {};
const fetchRemote = async url => {
  const { pathname } = new URL(url);
  if (pathname.startsWith('/repos/slow/tool/')) { stalled(); await stall; }
  if (pathname === '/search/repositories') return Response.json({ items: [{ full_name: 'example/tool', description: 'A tool', topics: ['mcp'] }] });
  if (pathname === '/repos/example/tool') return Response.json({ full_name: 'example/tool', description: 'A tool', topics: ['mcp'] });
  if (pathname === '/repos/example/tool/readme') return Response.json({ content: Buffer.from('# Tool\nRead me.').toString('base64') });
  if (pathname.startsWith('/repos/example/tool/commits/')) return Response.json({ sha: commit });
  if (pathname.startsWith('/repos/example/tool/git/trees/')) return Response.json({ tree: [{ type: 'blob', mode: '100644', path: 'README.md', size: 1 }] });
  return new Response('{}', { status: 404 });
};

async function serve(t, host = '127.0.0.1', files = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-mcp-'));
  for (const [name, contents] of Object.entries(files)) await writeFile(path.join(directory, name), contents);
  const app = express();
  attachApi(app, { directory, installerOptions: { env: {}, home: directory + '-home', searchPath: '', run: async () => ({ stdout: '{}' }), fetchRemote } });
  const server = app.listen(0, host);
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  await new Promise(resolve => server.once('listening', resolve));
  return { directory, server, port: server.address().port };
}
// Hold slow/tool lookups until release(); `reached` resolves once a lookup is waiting.
const holdSlow = () => {
  let release;
  stall = new Promise(resolve => { release = resolve; });
  const reached = new Promise(resolve => { stalled = resolve; });
  return { reached, release: () => { release(); stall = null; stalled = () => {}; } };
};
const tokenOf = async directory => (await readFile(path.join(directory, 'mcp-token'), 'utf8')).trim();
const card = (owner, repo) => ({ id: `${owner}--${repo}`, name: repo, repo: `${owner}/${repo}`, githubUrl: `https://github.com/${owner}/${repo}`,
  category: 'Other', categoryLabel: 'Other', description: '', primaryLanguage: 'Unknown', defaultInstallCommand: '', customNotes: '', customCommand: '', tags: [] });

const post = (url, headers, body) => new Promise((resolve, reject) => {
  const req = request(url, { method: 'POST', agent: false, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers } }, res => {
    let text = '';
    res.on('data', chunk => { text += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, body: text && JSON.parse(text) }));
  });
  req.on('error', reject);
  req.end(JSON.stringify(body));
});

test('MCP answers read-only questions only with the owner-only bearer token', async t => {
  const files = {
    'catalog.json': JSON.stringify([card('some_org.x', 'lib'), card('Example', 'Tool')]),
    'receipts.json': JSON.stringify({ receipts: [] }),
    'inventory.json': JSON.stringify({ installations: [{ name: 'Old Tool', githubUrl: 'https://github.com/example/old-tool', installed: true, location: '/fixture/old-tool', uninstallCommand: 'bash uninstall.sh' }], runs: [] }),
  };
  const { directory, port } = await serve(t, '127.0.0.1', files);
  const unchanged = async () => {
    for (const [name, contents] of Object.entries(files)) assert.equal(await readFile(path.join(directory, name), 'utf8'), contents, `${name} changed`);
  };
  const base = `http://127.0.0.1:${port}/mcp`;
  const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } };

  assert.equal((await post(base, {}, initialize)).status, 401, 'missing token');
  const tokenFile = path.join(directory, 'mcp-token');
  assert.equal((await stat(tokenFile)).mode & 0o777, 0o600);
  const token = (await readFile(tokenFile, 'utf8')).trim();
  assert.ok(token.length >= 32);
  assert.equal((await post(base, { authorization: `Bearer ${token}x` }, initialize)).status, 401, 'wrong token');
  assert.equal((await post(base, { authorization: token }, initialize)).status, 401, 'not a bearer token');

  const auth = { authorization: `Bearer ${token}` };
  const call = async (id, method, params) => {
    const response = await post(base, auth, { jsonrpc: '2.0', id, method, params });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body.result;
  };
  assert.equal((await call(1, 'initialize', initialize.params)).protocolVersion, '2025-06-18');
  assert.equal((await post(base, auth, { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  const tools = (await call(2, 'tools/list')).tools;
  assert.deepEqual(tools.map(tool => tool.name), ['search', 'repo_info', 'detect', 'list_components', 'list_unmanaged', 'plan', 'plan_status']);
  assert.ok(tools.every(tool => tool.annotations.readOnlyHint === (tool.name !== 'plan')));

  const tool = async (name, args) => {
    const result = await call(3, 'tools/call', { name, arguments: args });
    assert.ok(!result.isError, result.content[0].text);
    await unchanged();
    return JSON.parse(result.content[0].text);
  };
  assert.equal((await tool('search', { query: 'tool' })).results[0].repo, 'example/tool');
  const info = await tool('repo_info', { githubUrl: 'https://github.com/example/tool' });
  assert.equal(info.repo.description, 'A tool');
  assert.equal(info.readme, '# Tool\nRead me.');
  assert.equal(info.card.id, 'Example--Tool', 'matches the Card even when another Card has an owner githubRepo() rejects');
  assert.deepEqual((await tool('detect', { githubUrl: 'https://github.com/example/tool' })).version, commit);
  assert.deepEqual(await tool('list_components', {}), { receipts: [] });
  const unmanaged = { items: [{ kind: 'app', name: 'Old Tool', path: '/fixture/old-tool' }], warnings: [] };
  assert.deepEqual(await tool('list_unmanaged', {}), unmanaged);
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/api/installer/unmanaged`)).json(), unmanaged);
  const invalid = await call(4, 'tools/call', { name: 'repo_info', arguments: { githubUrl: 'https://example.test/x' } });
  assert.ok(invalid.isError);
  await unchanged();
  assert.deepEqual((await readdir(directory)).sort(), ['assistant-token', 'catalog.json', 'inventory.json', 'mcp-token', 'receipts.json', 'workspace'], 'MCP must not write the Library or Receipts');

  const hold = holdSlow();
  const pending = post(`http://127.0.0.1:${port}/api/installer/detect`, {}, { githubUrl: 'https://github.com/slow/tool' });
  await hold.reached;
  try {
    for (const name of ['detect', 'list_components', 'list_unmanaged']) {
      const result = await call(5, 'tools/call', { name, arguments: { githubUrl: 'https://github.com/example/tool' } });
      assert.ok(result.isError, name);
      assert.match(result.content[0].text, /Another task is running/);
    }
  } finally {
    hold.release();
    await pending;
  }
  assert.deepEqual(await tool('list_components', {}), { receipts: [] });

  const mcpHold = holdSlow();
  const mcpDetect = call(6, 'tools/call', { name: 'detect', arguments: { githubUrl: 'https://github.com/slow/tool' } });
  await mcpHold.reached;
  try {
    const second = await call(7, 'tools/call', { name: 'detect', arguments: { githubUrl: 'https://github.com/example/tool' } });
    assert.ok(second.isError, 'MCP detect runs one at a time');
    assert.match(second.content[0].text, /Another task is running/);
    const rest = await post(`http://127.0.0.1:${port}/api/installer/detect`, {}, { githubUrl: 'https://github.com/example/tool' });
    assert.equal(rest.status, 409, 'UI installer waits for MCP detect');
    assert.equal(rest.body.code, 'BUSY');
  } finally {
    mcpHold.release();
    await mcpDetect;
  }
  assert.deepEqual(await tool('list_components', {}), { receipts: [] }, 'MCP detect releases the busy lock');

  for (const headers of [{ host: 'example.test' }, { origin: 'https://example.test' }, { origin: `http://127.0.0.1:${port}`, 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await post(base, { ...auth, ...headers }, initialize)).status, 403, JSON.stringify(headers));
  }
});

test('MCP rejects a non-loopback peer with a valid token and local Host', async t => {
  const { directory, server, port } = await serve(t);
  assert.equal((await post(`http://127.0.0.1:${port}/mcp`, {}, {})).status, 401, 'token ready');
  server.on('connection', socket => Object.defineProperty(socket, 'remoteAddress', { value: '10.0.0.2' }));
  const response = await post(`http://127.0.0.1:${port}/mcp`, { authorization: `Bearer ${await tokenOf(directory)}` },
    { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(response.status, 403);
});

test('MCP rejects a non-loopback interface even with a valid token', async t => {
  const peer = Object.values(networkInterfaces()).flat().find(address => address.family === 'IPv4' && !address.internal);
  if (!peer) return t.skip('No non-loopback IPv4 interface');
  const { directory, port } = await serve(t, '0.0.0.0');
  assert.equal((await post(`http://127.0.0.1:${port}/mcp`, {}, {})).status, 401);
  const token = await tokenOf(directory);
  const response = await post(`http://${peer.address}:${port}/mcp`, { host: `127.0.0.1:${port}`, authorization: `Bearer ${token}` },
    { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(response.status, 403);
});
