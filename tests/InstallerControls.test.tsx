import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SkillControls, installationStatus, mergeInstallerReceipts, executeInstallerAction, type SkillReceipt } from '../frontend/src/installer';
import { INITIAL_ITEMS } from '../frontend/src/data/items';

const receipt: SkillReceipt = {
  id: 'review', name: 'review', kind: 'skill', version: 'a'.repeat(40), storePath: '/data/store/skills/review', status: 'enabled',
  recipe: { backend: 'files', source: { githubUrl: INITIAL_ITEMS[0].githubUrl, subpath: 'skills/review', ref: 'HEAD' } },
  activations: { codex: { path: '/home/.agents/skills/review', enabled: true }, claude: { path: '/home/.claude/skills/review', enabled: false } },
};

test('Cards expose all three installation states and independent accessible agent switches', () => {
  const item = { ...INITIAL_ITEMS[0], installed: false };
  assert.equal(installationStatus(item), 'Not installed');
  const available = renderToStaticMarkup(<SkillControls item={item} onChanged={async () => {}} onInstall={() => {}} />);
  assert.match(available, />Install<\/button>/);
  assert.doesNotMatch(available, /Skill directory|<input/);
  for (const status of ['enabled', 'disabled'] as const) {
    const saved = { ...receipt, status, activations: { ...receipt.activations, codex: { ...receipt.activations.codex, enabled: status === 'enabled' } } };
    const [installed] = mergeInstallerReceipts([item], [saved]);
    assert.equal(installationStatus(installed), status === 'enabled' ? 'Installed · Enabled' : 'Installed · Disabled');
    const html = renderToStaticMarkup(<SkillControls item={installed} onChanged={async () => {}} onInstall={() => {}} />);
    assert.match(html, /role="switch" aria-label="Enable review for Codex"/);
    assert.match(html, /role="switch" aria-label="Enable review for Claude" aria-checked="false"/);
    assert.match(html, new RegExp(`aria-label="Enable review for Codex" aria-checked="${status === 'enabled'}"`));
    assert.match(html, />Uninstall<\/button>/);
    assert.doesNotMatch(html, /Skill directory/);
  }
  assert.equal(mergeInstallerReceipts([item], [])[0].installed, false);
});

test('an installed app without a Receipt is Unmanaged and display-only', () => {
  const legacy = { ...INITIAL_ITEMS[0], installed: true, installedSkills: [] };
  assert.equal(installationStatus(legacy), 'Installed · Unmanaged');
  const html = renderToStaticMarkup(<SkillControls item={legacy} onChanged={async () => {}} onInstall={() => {}} />);
  assert.doesNotMatch(html, /<button/);
  assert.match(html, /Unmanaged · display only/);
});

test('explicit installer actions execute only the returned plan ID and surface typed conflicts', async t => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  const calls: unknown[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push([url, JSON.parse(options?.body as string)]);
    return new Response(JSON.stringify(String(url).endsWith('/plan') ? { id: 'server-plan' } : { ok: true }));
  };
  await executeInstallerAction({ action: 'disable', componentId: 'review', agent: 'codex' });
  assert.deepEqual(calls, [
    ['/api/installer/plan', { action: 'disable', componentId: 'review', agent: 'codex' }],
    ['/api/installer/execute', { planId: 'server-plan' }],
  ]);
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 'CONFLICT', error: 'Foreign directory.' }), { status: 409 });
  await assert.rejects(executeInstallerAction({ action: 'uninstall', componentId: 'review' }), { code: 'CONFLICT', message: 'Foreign directory.' });
});
