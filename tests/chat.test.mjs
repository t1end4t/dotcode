import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer as createTcpServer } from 'node:net';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Codex } from '@openai/codex-sdk';
import express from 'express';
import { attachApi } from '../backend/api.mjs';
import { answerChat } from '../backend/chat.mjs';
import { attachMcp } from '../backend/mcp.mjs';

const githubUrl = 'https://github.com/example/tool';

async function serve(t, createCodex, host = '127.0.0.1') {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-chat-'));
  const app = express();
  attachApi(app, { directory, createCodex, installerOptions: { env: {}, fetchRemote: async url => {
    const { pathname } = new URL(url);
    if (pathname === '/repos/example/tool') return Response.json({ full_name: 'example/tool' });
    if (pathname === '/repos/example/tool/readme') return Response.json({ content: Buffer.from('# Tool\nChecks YAML syntax.').toString('base64') });
    return new Response('{}', { status: 404 });
  } } });
  const server = app.listen(0, host);
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  await once(server, 'listening');
  const origin = `http://${host}:${server.address().port}`;
  // An unpaired request waits for the server to create its tokens.
  assert.equal((await fetch(`${origin}/api/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  const tokenFile = path.join(directory, 'assistant-token');
  const assistantToken = async () => (await readFile(tokenFile, 'utf8')).trim();
  const externalToken = async () => (await readFile(path.join(directory, 'mcp-token'), 'utf8')).trim();
  const post = async (body, headers = {}) => fetch(`${origin}/api/ai/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await assistantToken()}`, ...headers }, body: JSON.stringify(body),
  });
  return { origin, post, tokenFile, assistantToken, externalToken };
}

test('chat requires the owner-only pairing token before starting Codex', async t => {
  let starts = 0;
  let scoped;
  const { origin, post, tokenFile, assistantToken, externalToken } = await serve(t, ({ env }) => {
    starts++;
    scoped = env.DOTCODE_MCP_TOKEN;
    return { startThread: () => ({ run: async () => ({ finalResponse: 'Ready.' }) }) };
  });
  const body = { message: 'Check pairing' };
  const anonymous = await fetch(`${origin}/api/ai/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get('cache-control'), 'no-store');
  assert.equal((await stat(tokenFile)).mode & 0o777, 0o600);
  const paired = await assistantToken();
  assert.match(paired, /^[\w-]{43}$/);
  for (const token of ['invalid', await externalToken()]) {
    assert.equal((await post(body, { authorization: `Bearer ${token}` })).status, 401);
  }
  assert.equal(starts, 0);
  const response = await post(body);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: 'Ready.' });
  assert.equal(starts, 1);
  assert.notEqual(scoped, paired);
  assert.notEqual(scoped, await externalToken());
  assert.equal((await post(body, { authorization: `Bearer ${scoped}` })).status, 401);
  assert.equal(starts, 1);
  const mcp = token => fetch(`${origin}/mcp`, { method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert.equal((await mcp(paired)).status, 401);
  const { result } = await (await mcp(await externalToken())).json();
  assert.ok(result.tools.some(tool => tool.name === 'list_unmanaged'));
});

test('chat refuses a pairing token that other local users can read', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-chat-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'assistant-token'), 'p'.repeat(43) + '\n', { mode: 0o644 });
  await chmod(path.join(directory, 'assistant-token'), 0o644);
  let starts = 0;
  const app = express();
  attachApi(app, { directory, createCodex: () => { starts++; } });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ai/chat`, { method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${'p'.repeat(43)}` }, body: JSON.stringify({ message: 'Hi' }) });
  assert.equal(response.status, 503);
  assert.equal(starts, 0);
  assert.equal((await stat(path.join(directory, 'assistant-token'))).mode & 0o777, 0o644, 'DotCode must not silently repair a pairing token');
});

test('chat answers using allowlisted DotCode MCP tools, with server-owned credentials', async t => {
  const networkEnv = Object.fromEntries(['https_proxy', 'http_proxy', 'ALL_PROXY', 'all_proxy', 'SSL_CERT_DIR', 'CODEX_CA_CERTIFICATE']
    .map(key => [key, `test-${key}`]));
  t.mock.property(process, 'env', { ...process.env, ...networkEnv, NO_PROXY: 'example.test', no_proxy: 'other.test', GITHUB_TOKEN: 'not-for-codex' });
  const { post } = await serve(t, ({ config, env }) => ({ startThread: options => ({ run: async prompt => {
    for (const [key, value] of Object.entries(networkEnv)) assert.equal(env[key], value);
    assert.deepEqual(env.NO_PROXY?.split(','), ['example.test', '127.0.0.1']);
    assert.deepEqual(env.no_proxy?.split(','), ['other.test', '127.0.0.1']);
    assert.ok(!Object.hasOwn(env, 'GITHUB_TOKEN'));
    // `features.shell_tool=false` disables shell execution; the read-only sandbox blocks writes, not reads.
    assert.equal(config.features.shell_tool, false);
    assert.equal(options.sandboxMode, 'read-only');
    assert.equal(options.approvalPolicy, 'never');
    assert.equal(options.networkAccessEnabled, false);
    assert.equal(options.webSearchMode, 'disabled');
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
    assert.deepEqual(tools.map(tool => tool.name), mcp.enabled_tools);
    assert.ok(tools.every(tool => tool.annotations.readOnlyHint));
    for (const name of ['execute', 'list_unmanaged']) {
      assert.equal((await rpc('tools/call', { name })).error?.code, -32602);
    }
    const { result } = await rpc('tools/call', { name: 'repo_info', arguments: { githubUrl } });
    return { finalResponse: JSON.parse(result.content[0].text).readme.split('\n').at(-1) };
  } }) }));
  const response = await post({ message: 'What does this repository do?', githubUrl });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: 'Checks YAML syntax.' });
});

test('Codex bypasses provider proxies for authenticated local MCP', { timeout: 20000 }, async t => {
  const requests = [];
  const proxy = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ url: req.url, body: Buffer.concat(chunks).toString() });
    res.writeHead(401).end();
  }).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => proxy.close(resolve)));
  await once(proxy, 'listening');
  const proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
  const home = await mkdtemp(path.join(tmpdir(), 'dotcode-codex-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  // Isolate Codex from user credentials, config, and proxy settings. The provider is a local fixture.
  t.mock.property(process, 'env', {
    PATH: process.env.PATH, HOME: home, CODEX_HOME: home, CODEX_API_KEY: 'test-provider-key',
    HTTP_PROXY: proxyUrl, HTTPS_PROXY: proxyUrl,
  });
  const token = 'local-mcp-fixture-token-not-a-secret';
  let authenticatedMcp;
  const app = express();
  app.post('/mcp', (req, _res, next) => {
    authenticatedMcp ||= req.headers.authorization === `Bearer ${token}`;
    next();
  });
  attachMcp(app, { isLocal: () => true, token: Promise.resolve(token), tools: [] });
  const mcp = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => mcp.close(resolve)));
  await once(mcp, 'listening');

  const providerUrl = `http://localhost:${proxy.address().port}/v1`;
  for (const noProxy of [undefined, '*']) {
    requests.length = 0;
    authenticatedMcp = false;
    if (noProxy) process.env.NO_PROXY = noProxy;
    await assert.rejects(answerChat({
      message: 'Hello', history: [], mcpUrl: `http://127.0.0.1:${mcp.address().port}/mcp`, token, tools: [],
      createCodex: options => new Codex({ ...options, config: {
        ...options.config, model: 'gpt-5.4', model_provider: 'fixture', model_providers: { fixture: {
          name: 'Fixture', base_url: providerUrl, env_key: 'CODEX_API_KEY', wire_api: 'responses',
          request_max_retries: 0, stream_max_retries: 0,
        } },
      } }),
    }), /401|MCP/);
    assert.ok(requests.every(({ url }) => !url.endsWith('/mcp')), 'the proxy must never receive local MCP requests');
    assert.ok(authenticatedMcp, 'MCP must receive its bearer token directly');
    if (!noProxy) {
      const request = requests.find(({ url }) => url === `${providerUrl}/responses`);
      assert.ok(request, 'provider requests should still use the proxy');
      const { tools } = JSON.parse(request.body);
      assert.ok(tools.length, 'the real Codex request should advertise tools');
      assert.doesNotMatch(JSON.stringify(tools.map(({ name, type }) => name ?? type)), /"(?:apply_patch|shell|local_shell|shell_command|exec|exec_command|write_stdin|web_search(?:_preview)?|(?:get|create|update)_goal)"/);
    }
  }
});

test('bundled Codex authenticates the default provider with CODEX_API_KEY', { timeout: 30000 }, async t => {
  const auth = [];
  // Local fixture provider and proxy: every request, direct or proxied, ends here.
  const provider = createServer((req, res) => { auth.push(req.headers.authorization); res.writeHead(400).end(); });
  provider.on('connect', (req, socket) => { auth.push(`CONNECT ${req.url}`); socket.destroy(); });
  provider.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => provider.close(resolve)));
  await once(provider, 'listening');
  const local = `http://127.0.0.1:${provider.address().port}`;
  const home = await mkdtemp(path.join(tmpdir(), 'dotcode-codex-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  t.mock.property(process, 'env', {
    PATH: process.env.PATH, HOME: home, CODEX_HOME: home, CODEX_API_KEY: 'fixture-codex-key', OPENAI_API_KEY: 'fixture-openai-key',
    HTTP_PROXY: local, HTTPS_PROXY: local,
  });
  await assert.rejects(answerChat({
    message: 'Hello', history: [], mcpUrl: `${local}/mcp`, token: 'unused', tools: [],
    createCodex: options => new Codex({ ...options, config: { ...options.config, openai_base_url: `${local}/v1`, mcp_servers: {} } }),
  }));
  assert.ok(auth.length, 'Codex should call the fixture provider');
  assert.deepEqual([...new Set(auth)], ['Bearer fixture-codex-key']);
});

test('the bundled Linux read-only sandbox blocks writes and network access', { skip: process.platform !== 'linux' }, async t => {
  const home = await mkdtemp(path.join(tmpdir(), 'dotcode-sandbox-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const server = createTcpServer(socket => socket.end()).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const sdkRequire = createRequire(import.meta.resolve('@openai/codex-sdk'));
  const cli = path.join(path.dirname(sdkRequire.resolve('@openai/codex/package.json')), 'bin/codex.js');
  const probe = `
    let writeBlocked = false;
    try { require('node:fs').writeFileSync('sandbox-canary', 'test'); }
    catch (error) { writeBlocked = ['EROFS', 'EACCES', 'EPERM'].includes(error.code); }
    const socket = require('node:net').connect(Number(process.argv[1]), '127.0.0.1');
    socket.on('connect', () => process.exit(1));
    socket.on('error', error => process.exit(writeBlocked && ['EACCES', 'EPERM'].includes(error.code) ? 42 : 1));
  `;
  const child = spawn(process.execPath,
    [cli, '--sandbox', 'read-only', 'sandbox', '--', process.execPath, '-e', probe, String(server.address().port)],
    { cwd: home, env: { PATH: process.env.PATH, HOME: home, CODEX_HOME: home }, stdio: 'inherit', timeout: 10000 });
  assert.deepEqual(await once(child, 'close'), [42, null], 'both sandbox operations must be denied');
});

test('chat connects to MCP on the bound loopback address, not the request Host', async t => {
  const { NO_PROXY, no_proxy, ...networkEnv } = process.env;
  t.mock.property(process, 'env', networkEnv);
  const { post } = await serve(t, ({ config, env }) => ({ startThread: () => ({ run: async () => {
    const mcp = config.mcp_servers.dotcode;
    assert.equal(new URL(mcp.url).hostname, '127.0.0.2');
    assert.equal(env.NO_PROXY, '127.0.0.2');
    assert.equal(env.no_proxy, '127.0.0.2');
    const response = await fetch(mcp.url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env[mcp.bearer_token_env_var]}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { jsonrpc: '2.0', id: 1, result: {} });
    return { finalResponse: 'MCP is reachable.' };
  } }) }), '127.0.0.2');
  const response = await post({ message: 'Check MCP' }, { host: '127.0.0.3:12345', 'x-forwarded-host': 'example.test' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: 'MCP is reachable.' });
});

test('chat rejects foreign origins and invalid input, and surfaces safe errors from Codex', async t => {
  const secret = 'never-return-this-token';
  let attempts = 0;
  const { post } = await serve(t, () => ({ startThread: () => ({ run: async () => {
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
