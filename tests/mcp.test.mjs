import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { request } from 'node:http';
import { networkInterfaces, tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { attachApi } from '../backend/api.mjs';

const commit = 'a'.repeat(40);
const fetchRemote = async url => {
  const { pathname } = new URL(url);
  if (pathname === '/search/repositories') return Response.json({ items: [{ full_name: 'example/tool', description: 'A tool', topics: ['mcp'] }] });
  if (pathname === '/repos/example/tool') return Response.json({ full_name: 'example/tool', description: 'A tool', topics: ['mcp'] });
  if (pathname === '/repos/example/tool/readme') return Response.json({ content: Buffer.from('# Tool\nRead me.').toString('base64') });
  if (pathname.startsWith('/repos/example/tool/commits/')) return Response.json({ sha: commit });
  if (pathname.startsWith('/repos/example/tool/git/trees/')) return Response.json({ tree: [{ type: 'blob', mode: '100644', path: 'README.md', size: 1 }] });
  return new Response('{}', { status: 404 });
};

async function serve(t, host = '127.0.0.1') {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-mcp-'));
  const app = express();
  attachApi(app, { directory, installerOptions: { env: {}, run: async () => ({ stdout: '{}' }), fetchRemote } });
  const server = app.listen(0, host);
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  await new Promise(resolve => server.once('listening', resolve));
  return { directory, port: server.address().port };
}

const post = (url, headers, body) => new Promise((resolve, reject) => {
  const req = request(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers } }, res => {
    let text = '';
    res.on('data', chunk => { text += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, body: text && JSON.parse(text) }));
  });
  req.on('error', reject);
  req.end(JSON.stringify(body));
});

test('MCP answers read-only questions only with the owner-only bearer token', async t => {
  const { directory, port } = await serve(t);
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
  assert.deepEqual(tools.map(tool => tool.name), ['search', 'repo_info', 'detect', 'list_components']);
  assert.ok(tools.every(tool => tool.annotations.readOnlyHint));

  const tool = async (name, args) => {
    const result = await call(3, 'tools/call', { name, arguments: args });
    assert.ok(!result.isError, result.content[0].text);
    return JSON.parse(result.content[0].text);
  };
  assert.equal((await tool('search', { query: 'tool' })).results[0].repo, 'example/tool');
  const info = await tool('repo_info', { githubUrl: 'https://github.com/example/tool' });
  assert.equal(info.repo.description, 'A tool');
  assert.equal(info.readme, '# Tool\nRead me.');
  assert.equal(info.card, null);
  assert.deepEqual((await tool('detect', { githubUrl: 'https://github.com/example/tool' })).version, commit);
  assert.deepEqual(await tool('list_components', {}), { receipts: [] });
  const invalid = await call(4, 'tools/call', { name: 'repo_info', arguments: { githubUrl: 'https://example.test/x' } });
  assert.ok(invalid.isError);

  assert.deepEqual((await readdir(directory)).sort(), ['mcp-token', 'workspace'], 'MCP must not write the Library or Receipts');

  for (const headers of [{ host: 'example.test' }, { origin: 'https://example.test' }, { origin: `http://127.0.0.1:${port}`, 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await post(base, { ...auth, ...headers }, initialize)).status, 403, JSON.stringify(headers));
  }
});

test('MCP rejects a non-loopback peer even with a valid token', async t => {
  const peer = Object.values(networkInterfaces()).flat().find(address => address.family === 'IPv4' && !address.internal);
  if (!peer) return t.skip('No non-loopback IPv4 interface');
  const { directory, port } = await serve(t, '0.0.0.0');
  assert.equal((await post(`http://127.0.0.1:${port}/mcp`, {}, {})).status, 401);
  const token = (await readFile(path.join(directory, 'mcp-token'), 'utf8')).trim();
  const response = await post(`http://${peer.address}:${port}/mcp`, { host: `127.0.0.1:${port}`, authorization: `Bearer ${token}` },
    { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.equal(response.status, 403);
});
