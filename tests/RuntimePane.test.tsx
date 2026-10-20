import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../frontend/src/App';
import { Agents, Models, RuntimePane, Services } from '../frontend/src/components/RuntimePane';

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

test('dashboard uses the reference typography, palettes and fixed compact rail', () => {
  const css = readFileSync('frontend/src/index.css', 'utf8');
  assert.match(css, /font-family: 'Public Sans'/);
  assert.match(css, /font-family: 'IBM Plex Mono'/);
  assert.match(css, /--dc-paper: #E6E9EF/i);
  assert.match(css, /--dc-paper: #1F1E1D/i);
  assert.match(css, /prefers-color-scheme: dark/);
  assert.match(css, /\.workspace-nav \{[^}]*width: 64px/);
  assert.match(css, /\.workspace-topbar \{[^}]*height: 52px/);
  assert.doesNotMatch(css, /width: 232px|Georgia|Plus Jakarta Sans|Geist Mono/);
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
  assert.match(models, /<input[^>]*type="radio"/);
  assert.match(models, /<details[^>]*>.*?<summary>.*?Launch settings/s);
  assert.doesNotMatch(models, /Hugging Face repository/);

  const agents = renderToStaticMarkup(<Agents {...props} />);
  assert.match(agents, /Add skill/);
  assert.match(agents, /Review code changes/);
  assert.match(agents, /Search agent setup/);
  assert.doesNotMatch(agents, /<form|<textarea/);
  assert.match(agents, /Global agent settings stay unchanged/);
});

test('runtime surfaces explain scope and never offer an unapproved execution shortcut', () => {
  for (const tab of ['services', 'models', 'agents'] as const) {
    const html = renderToStaticMarkup(<RuntimePane tab={tab} />);
    assert.match(html, /Loading/);
    assert.doesNotMatch(html, /<textarea[^>]*defaultValue="\{/);
    assert.match(html, /approval|Approval/);
  }
});
