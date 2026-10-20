import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../frontend/src/App';
import { Agents, Models, RuntimePane, Services, executeRuntimeAction } from '../frontend/src/components/RuntimePane';

test('dashboard separates tools, services, models and agent setup', () => {
  const html = renderToStaticMarkup(<App />);
  for (const name of ['Tool Library', 'Services', 'Models', 'Agent Setup']) assert.ok(html.includes(name));
  assert.match(html, /aria-current="page"/);
  const nav = html.match(/<nav[^>]*aria-label="Dashboard sections"[^>]*>/)?.[0] ?? '';
  assert.match(nav, /flex-col/);
  assert.match(nav, /border-r/);
  for (const name of ['Tool Library', 'Services', 'Models', 'Agent Setup']) assert.ok(html.includes(`aria-label="${name}"`));
  assert.ok(html.indexOf('</header>') < html.indexOf(nav), 'full-width topbar sits above the navigation rail');
  assert.doesNotMatch(html, /workspace-nav-footer|nav-heading|brand-caption/);
  assert.doesNotMatch(html, /Close AI pane|Close Copilot/, 'assistant does not take workspace width on first load');
  assert.match(html, /aria-expanded="false"/);
});

test('dashboard uses Catppuccin Mocha, reference typography and a fixed compact rail', () => {
  const css = readFileSync('frontend/src/index.css', 'utf8');
  assert.match(css, /font-family: 'Public Sans'/);
  assert.match(css, /font-family: 'IBM Plex Mono'/);
  assert.match(css, /--ctp-base: #1e1e2e/i);
  assert.match(css, /--ctp-text: #cdd6f4/i);
  assert.match(css, /color-scheme: dark/);
  assert.match(css, /\.workspace-nav \{[^}]*width: 64px/);
  assert.match(css, /\.workspace-topbar \{[^}]*height: 52px/);
  assert.doesNotMatch(css, /width: 232px|Georgia|Plus Jakarta Sans|Geist Mono/);
});

test('dashboard content uses the available width when the assistant closes', () => {
  const css = readFileSync('frontend/src/index.css', 'utf8');
  const contentRule = css.match(/\.runtime-content\s*\{([^}]+)\}/)?.[1];
  assert.ok(contentRule);
  assert.doesNotMatch(contentRule, /max-width\s*:/);
});

test('library summary aligns icons and separates wrapping statistics', () => {
  const html = renderToStaticMarkup(<App />);
  const css = readFileSync('frontend/src/index.css', 'utf8');
  assert.match(html, /class="runtime-context"/);
  const summary = css.match(/\.runtime-context\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.match(summary, /display:\s*flex/);
  assert.match(summary, /flex-wrap:\s*wrap/);
  assert.match(summary, /gap:/);
  assert.match(summary, /padding:/);
  assert.match(css, /\.runtime-context > span\s*\{[^}]*display:\s*inline-flex/);
});

const snapshot: Parameters<typeof Services>[0]['snapshot'] = {
  directory: '/tmp/dotcode', workspace: '/tmp/dotcode/workspace',
  services: [{ id: 'router', name: '9Router', port: 20128, unit: 'router.service', external: true, adopted: false, installed: true, running: true, status: 'active', autostart: true, pid: 1 }],
  models: [{ fileName: 'test.gguf', sizeBytes: 1024, projector: false, status: 'ready', logs: [] }],
  agents: [{ id: 'review', agent: 'codex', category: 'skill', name: 'review', enabled: true, description: 'Review code changes' }],
  installedSkills: [], importableModels: [], downloads: [], history: [], backend: 'llama.cpp', endpoint: '', external: { models: [], error: null }, hardware: { ramTotalBytes: 1024, ramFreeBytes: 512 },
};

test('runtime lists keep creation forms out of the workspace until requested', () => {
  const props = { snapshot, working: false, request: () => {}, showLogs: () => {} };
  const services = renderToStaticMarkup(<Services {...props} />);
  assert.match(services, /Add service/);
  assert.match(services, /Search services/);
  assert.match(services, /Take over controls/);
  assert.doesNotMatch(services, /<form/);

  const models = renderToStaticMarkup(<Models {...props} />);
  assert.match(models, /Download GGUF/);
  assert.match(models, /test.gguf/);
  assert.doesNotMatch(models, /Hugging Face repository/);

  const agents = renderToStaticMarkup(<Agents {...props} />);
  assert.match(agents, /Add skill/);
  assert.match(agents, /Review code changes/);
  assert.match(agents, /Search agent setup/);
  assert.doesNotMatch(agents, /<form|<textarea/);
  assert.match(agents, /Global agent settings stay unchanged/);
});

test('service cards expose an accessible autostart toggle after takeover', () => {
  const html = renderToStaticMarkup(<Services snapshot={{ ...snapshot, services: [{ ...snapshot.services[0], adopted: true }] }} working={false} request={() => {}} showLogs={() => {}} />);
  assert.match(html, /runtime-card[^"]*is-live/);
  assert.match(html, /<button[^>]*role="switch"[^>]*aria-checked="true"[^>]*aria-label="Toggle autostart for 9Router"/);
  assert.doesNotMatch(html.match(/<button[^>]*role="switch"[^>]*>/)?.[0] ?? '', /\sdisabled=""/);
  assert.match(html, /aria-label="Edit 9Router"/);
  for (const service of [{ ...snapshot.services[0] }, { ...snapshot.services[0], adopted: true, installed: false }, { ...snapshot.services[0], adopted: true, error: 'Status unavailable' }]) {
    const unavailable = renderToStaticMarkup(<Services snapshot={{ ...snapshot, services: [service] }} working={false} request={() => {}} showLogs={() => {}} />);
    assert.match(unavailable.match(/<button[^>]*role="switch"[^>]*>/)?.[0] ?? '', /\sdisabled=""/);
  }
});

test('Remove deletes managed services but protects external units', () => {
  for (const external of [false, true]) {
    const props = { snapshot: { ...snapshot, services: [{ ...snapshot.services[0], external, adopted: false }] }, request: () => {}, showLogs: () => {} };
    const html = renderToStaticMarkup(<Services {...props} working={false} />);
    const remove = html.match(/<button[^>]*aria-label="Remove 9Router"[^>]*>/)?.[0] ?? '';
    assert.ok(remove);
    assert.equal(/\sdisabled=""/.test(remove), external);
    assert.match(html, /[Ss]tops the service, disables autostart/);
    assert.doesNotMatch(html, /Remove from dashboard/);
    const busy = renderToStaticMarkup(<Services {...props} working />);
    assert.match(busy.match(/<button[^>]*aria-label="Remove 9Router"[^>]*>/)?.[0] ?? '', /\sdisabled=""/);
  }
});

test('models are editable cards with saved launch settings', () => {
  const html = renderToStaticMarkup(<Models snapshot={{ ...snapshot, models: [{ ...snapshot.models[0], settings: { port: 8091, contextLength: 8192, gpuLayers: 12 } }] }} working={false} request={() => {}} />);
  assert.match(html, /aria-label="Managed models" class="runtime-card-grid"/);
  assert.match(html, /aria-label="Edit test.gguf"/);
  assert.match(html, /aria-label="Edit inference backend"/);
  assert.match(html, /8091/);
  assert.match(html, /8192/);
  assert.doesNotMatch(html, /Launch settings|type="radio"/);
});

test('runtime surfaces treat an explicit action as approval without a second dialog', () => {
  for (const tab of ['services', 'models', 'agents'] as const) {
    const html = renderToStaticMarkup(<RuntimePane tab={tab} />);
    assert.match(html, /Loading/);
    assert.doesNotMatch(html, /<textarea[^>]*defaultValue="\{/);
    assert.doesNotMatch(html, /Clicking an action authorizes it|No second prompt|runtime-context/);
    assert.doesNotMatch(html, /Approval required|Approve and run/);
  }
});

test('managed service command editing supports an explicit save and restart', () => {
  const source = readFileSync('frontend/src/components/RuntimePane.tsx', 'utf8');
  assert.match(source, /name="restart"[^>]*>Save and restart/);
  assert.match(source, /shellCommand: draft\.shellCommand/);
  assert.doesNotMatch(source, /Read from the Thinking OS wrapper/);
});

test('runtime actions execute exactly the server plan from one action click', async t => {
  const calls: { url: string; body: unknown }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls.push({ url, body: JSON.parse(options.body as string) });
    return Response.json(url.endsWith('/plan') ? { id: 'bound-plan', request: { action: 'restart' } } : { message: 'Stopped' });
  });
  assert.deepEqual(await executeRuntimeAction({ kind: 'service', id: 'router', action: 'stop' }), { message: 'Stopped' });
  assert.deepEqual(calls, [
    { url: '/api/runtime/plan', body: { kind: 'service', id: 'router', action: 'stop' } },
    { url: '/api/runtime/execute', body: { planId: 'bound-plan' } },
  ]);
});

test('runtime actions do not execute a rejected plan and report execution errors', async t => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    calls.push(url);
    return Response.json({ error: 'Take over first' }, { status: 400 });
  });
  await assert.rejects(executeRuntimeAction({ kind: 'service', id: 'router', action: 'stop' }), /Take over first/);
  assert.deepEqual(calls, ['/api/runtime/plan']);
  t.mock.method(globalThis, 'fetch', async (url: string) => url.endsWith('/plan') ? Response.json({ id: 'stale' }) : Response.json({ error: 'Runtime settings changed' }, { status: 409 }));
  await assert.rejects(executeRuntimeAction({ kind: 'service', id: 'router', action: 'stop' }), /Runtime settings changed/);
});
