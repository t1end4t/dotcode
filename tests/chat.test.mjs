import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { attachApi } from '../backend/api.mjs';

const githubUrl = 'https://github.com/example/tool';

async function serve(t, createCodex) {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-chat-'));
  const app = express();
  attachApi(app, { directory, createCodex, installerOptions: { env: {}, fetchRemote: async url => {
    const { pathname } = new URL(url);
    if (pathname === '/repos/example/tool') return Response.json({ full_name: 'example/tool' });
    if (pathname === '/repos/example/tool/readme') return Response.json({ content: Buffer.from('# Tool\nChecks YAML syntax.').toString('base64') });
    return new Response('{}', { status: 404 });
  } } });
  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  return (body, headers = {}) => fetch(`${origin}/api/ai/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}

test('chat answers using the same read-only MCP tools as DotCode, with server-owned credentials', async t => {
  const post = await serve(t, ({ config, env }) => ({ startThread: options => ({ run: async prompt => {
    // Codex 0.172.0 always exposes `exec` and `apply_patch`, so the sandbox is the write guarantee.
    assert.equal(options.sandboxMode, 'read-only');
    assert.equal(options.approvalPolicy, 'never');
    assert.equal(options.networkAccessEnabled, false);
    assert.equal(options.webSearchMode, 'disabled');
    assert.equal(config.features.shell_tool, false);
    assert.equal(config.features.hooks, false);
    assert.equal(config.agents.enabled, false);
    assert.deepEqual(Object.keys(config.mcp_servers), ['dotcode']);
    const mcp = config.mcp_servers.dotcode;
    const token = env[mcp.bearer_token_env_var];
    assert.ok(token?.length >= 32);
    assert.match(prompt, /What does this repository do\?/);
    assert.ok(prompt.includes(githubUrl));
    assert.ok(!prompt.includes(token));
    const rpc = async (method, params) => {
      const response = await fetch(mcp.url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      assert.equal(response.status, 200);
      return response.json();
    };
    const { result: { tools } } = await rpc('tools/list');
    assert.deepEqual(mcp.enabled_tools, tools.map(tool => tool.name));
    assert.ok(tools.every(tool => tool.annotations.readOnlyHint));
    assert.match((await rpc('tools/call', { name: 'execute' })).error.message, /Unknown tool/);
    const { result } = await rpc('tools/call', { name: 'repo_info', arguments: { githubUrl } });
    return { finalResponse: JSON.parse(result.content[0].text).readme.split('\n').at(-1) };
  } }) }));
  const response = await post({ message: 'What does this repository do?', githubUrl });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: 'Checks YAML syntax.' });
});

test('chat rejects foreign origins and invalid input, and surfaces safe errors from Codex', async t => {
  const secret = 'never-return-this-token';
  let attempts = 0;
  const post = await serve(t, () => ({ startThread: () => ({ run: async () => {
    throw new Error(`${attempts++ ? 'Connection refused' : '401 Unauthorized'}: ${secret}`);
  } }) }));
  assert.equal((await post({ message: 'Read the repo' }, { origin: 'https://foreign.test' })).status, 403);
  assert.equal((await post({ message: ' ' })).status, 400);
  assert.equal((await post({ message: 'Read the repo', githubUrl: 'http://127.0.0.1:9' })).status, 400);
  assert.equal(attempts, 0);
  for (const message of [/sign-in failed/, /Check the connection/]) {
    const response = await post({ message: 'Read the repo' });
    assert.equal(response.status, 502);
    const { error } = await response.json();
    assert.match(error, message);
    assert.ok(!error.includes(secret));
  }
});
