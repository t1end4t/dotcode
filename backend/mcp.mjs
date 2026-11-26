import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { open, writeFile } from 'node:fs/promises';
import express from 'express';

const protocolVersions = ['2025-11-25', '2025-06-18', '2025-03-26'];
const digest = value => createHash('sha256').update(value).digest();
export const newBearer = () => randomBytes(32).toString('base64url');
export function hasBearer(req, expected) {
  if (req.headersDistinct.authorization?.length !== 1) return false;
  const provided = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '')?.[1];
  return !!(expected && provided && timingSafeEqual(digest(provided), digest(expected)));
}

export async function fileBearer(file, { pairing = false } = {}) {
  try { await writeFile(file, newBearer() + '\n', { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('Bearer token must be a regular file.');
    if (pairing && (info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600 || info.nlink !== 1 || info.size > 45)) {
      throw new Error('Assistant token must be an owner-only 0600 file. Rotate it before pairing.');
    }
    if (!pairing) await handle.chmod(0o600);
    const token = (await handle.readFile('utf8')).trim();
    if (pairing ? !/^[\w-]{43}$/.test(token) : token.length < 32) throw new Error('Bearer token file is invalid.');
    return token;
  } finally { await handle.close(); }
}

// ponytail: stateless Streamable HTTP with JSON responses only; add sessions and SSE when a tool needs to stream or notify.
export function attachMcp(app, { isLocal, token, tools, assistant }) {
  const byName = new Map(tools.map(tool => [tool.name, tool]));
  const reply = (id, result) => ({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  app.use('/mcp', async (req, res, next) => {
    if (!isLocal(req)) return res.status(403).json(fail(null, -32000, 'Local, same-origin requests only.'));
    // Assistant credentials are scoped to their active chat turn.
    const scope = assistant?.();
    if (hasBearer(req, scope?.token)) {
      res.locals.scope = scope;
      res.locals.mcpTools = new Map(scope.tools.map(name => [name, byName.get(name)]));
    } else {
      let expected;
      try { expected = await token; }
      catch { return res.status(500).json(fail(null, -32603, 'MCP token unavailable. See the DotCode server log.')); }
      if (!hasBearer(req, expected)) {
        return res.status(401).set('www-authenticate', 'Bearer').json(fail(null, -32001, 'A valid bearer token is required.'));
      }
      res.locals.mcpTools = byName;
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
        instructions: 'Read DotCode and GitHub data. When available, plan proposes a skill install for the user to approve in the UI; no tool installs or approves.',
      }));
    }
    if (method === 'ping') return res.json(reply(id, {}));
    const available = res.locals.mcpTools;
    if (method === 'tools/list') {
      return res.json(reply(id, { tools: Array.from(available.values(), ({ name, description, inputSchema, readOnlyHint = true }) => ({ name, description, inputSchema, annotations: { readOnlyHint } })) }));
    }
    if (method !== 'tools/call') return res.json(fail(id, -32601, `Unknown method: ${method}`));
    const tool = available.get(params?.name);
    if (!tool) return res.json(fail(id, -32602, `Unknown tool: ${params?.name}`));
    const args = params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments) ? params.arguments : {};
    try { res.json(reply(id, { content: [{ type: 'text', text: JSON.stringify(await tool.call(args, res.locals.scope, req), null, 2) }] })); }
    catch (error) { res.json(reply(id, { content: [{ type: 'text', text: error.code ? JSON.stringify({ code: error.code, message: error.message }) : error.message }], isError: true })); }
  });
  app.all('/mcp', (_req, res) => res.status(405).set('allow', 'POST').json(fail(null, -32000, 'Use POST.')));
  app.use('/mcp', (error, _req, res, _next) => res.status(400).json(fail(null, -32700, error.type === 'entity.too.large' ? 'Message too large.' : 'Invalid JSON.')));
}
