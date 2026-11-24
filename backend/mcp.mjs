import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmod, lstat, readFile, writeFile } from 'node:fs/promises';
import express from 'express';

const protocolVersions = ['2025-11-25', '2025-06-18', '2025-03-26'];
const digest = value => createHash('sha256').update(value).digest();

export async function mcpToken(file) {
  try { await writeFile(file, randomBytes(32).toString('base64url') + '\n', { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (!(await lstat(file)).isFile()) throw new Error('MCP token must be a regular file.');
  await chmod(file, 0o600);
  const token = (await readFile(file, 'utf8')).trim();
  if (token.length < 32) throw new Error('MCP token file is invalid.');
  return token;
}

// ponytail: stateless Streamable HTTP with JSON responses only; add sessions and SSE when a tool needs to stream or notify.
export function attachMcp(app, { isLocal, token, tools }) {
  const byName = new Map(tools.map(tool => [tool.name, tool]));
  const reply = (id, result) => ({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  app.use('/mcp', async (req, res, next) => {
    if (!isLocal(req)) return res.status(403).json(fail(null, -32000, 'Local, same-origin requests only.'));
    let expected;
    try { expected = await token; }
    catch (error) { return res.status(500).json(fail(null, -32603, `MCP token unavailable: ${error.message}`)); }
    const provided = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!provided || !timingSafeEqual(digest(provided), digest(expected))) {
      return res.status(401).set('www-authenticate', 'Bearer').json(fail(null, -32001, 'A valid bearer token is required.'));
    }
    res.setHeader('cache-control', 'no-store');
    next();
  });
  app.post('/mcp', express.json({ limit: '256kb' }), async (req, res) => {
    const message = req.body;
    if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0') {
      return res.status(400).json(fail(null, -32600, 'Send one JSON-RPC 2.0 message.'));
    }
    if (message.id === undefined || message.method === undefined) return res.status(202).end();
    const { id, method, params } = message;
    if (method === 'initialize') {
      return res.json(reply(id, {
        protocolVersion: protocolVersions.includes(params?.protocolVersion) ? params.protocolVersion : protocolVersions[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'dotcode', version: '0.0.0' },
        instructions: 'Read-only access to DotCode: search GitHub, read repository info and README, run the Detector, and list installed Components.',
      }));
    }
    if (method === 'ping') return res.json(reply(id, {}));
    if (method === 'tools/list') {
      return res.json(reply(id, { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema, annotations: { readOnlyHint: true } })) }));
    }
    if (method !== 'tools/call') return res.json(fail(id, -32601, `Unknown method: ${method}`));
    const tool = byName.get(params?.name);
    if (!tool) return res.json(fail(id, -32602, `Unknown tool: ${params?.name}`));
    const args = params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments) ? params.arguments : {};
    try { res.json(reply(id, { content: [{ type: 'text', text: JSON.stringify(await tool.call(args), null, 2) }] })); }
    catch (error) { res.json(reply(id, { content: [{ type: 'text', text: error.message }], isError: true })); }
  });
  app.all('/mcp', (_req, res) => res.status(405).set('allow', 'POST').json(fail(null, -32000, 'Use POST.')));
  app.use('/mcp', (error, _req, res, _next) => res.status(400).json(fail(null, -32700, error.type === 'entity.too.large' ? 'Message too large.' : 'Invalid JSON.')));
}
