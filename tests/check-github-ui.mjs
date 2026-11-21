// Run against a local app in an Orca browser: node tests/check-github-ui.mjs <browserPageId> [width] [height].
// GitHub search, Add and subsequent catalog reads use browser fixtures; no Cards are written.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const page = process.argv[2];
assert.ok(page, 'Pass an Orca browserPageId.');
const cli = process.env.ORCA_CLI_COMMAND || 'orca-ide';
function command(...args) {
  const response = JSON.parse(execFileSync(cli, [...args, '--page', page, '--json'], { encoding: 'utf8' }));
  assert.equal(response.ok, true, JSON.stringify(response.error));
  return response.result;
}
function evaluate(source) {
  return JSON.parse(command('eval', '--expression', `(async () => JSON.stringify(await (async () => { ${source} })()))()`).result);
}
assert.equal(evaluate('return location.hostname;'), '127.0.0.1');
command('reload');
command('wait', '--selector', '.library-heading .button');
if (process.argv[3]) command('exec', '--command', `set viewport ${Number(process.argv[3])} ${Number(process.argv[4] || 844)}`);
evaluate('document.querySelector(".library-heading .button").click(); return true;');
command('wait', '--selector', '[aria-label="Search GitHub"]');
evaluate(`
  window.__searchOriginalFetch = window.fetch;
  window.__searchCalls = [];
  window.__savedCards = [];
  window.__slowSearch = null;
  const card = { id: 'fixture-review', name: 'review', repo: 'example/review', githubUrl: 'https://github.com/example/review', category: 'Skills', categoryLabel: 'Skills',
    description: 'UI test fixture: review code.', tags: ['review'], primaryLanguage: 'TypeScript', stars: 42, latestReleaseAt: '2026-11-20T12:00:00Z',
    defaultInstallCommand: '', customNotes: '', customCommand: '', detection: { checkedAt: new Date().toISOString(), commit: 'a'.repeat(40), badges: ['Skill'], skillPaths: [''] } };
  window.fetch = async (input, options) => {
    const url = new URL(String(input), location.href);
    if (url.pathname.startsWith('/api/ai/')) throw new Error('AI must not be called');
    if (url.pathname === '/api/installer/search') {
      window.__searchCalls.push(url.searchParams.get('q'));
      const q = url.searchParams.get('q');
      if (q === 'slow') await new Promise(resolve => { window.__slowSearch = resolve; });
      if (q === 'limited') return Response.json({ error: 'GitHub rate limit. Retry later.' }, { status: 429 });
      if (q.startsWith('https://example.com')) return Response.json({ error: 'Use a GitHub repository URL.' }, { status: 400 });
      return Response.json({ results: q === 'empty' ? [] : [card], warning: 'No GitHub token found. Anonymous limits apply.' });
    }
    if (url.pathname === '/api/catalog/cards') { window.__savedCards = [card]; return Response.json({ item: card }, { status: 201 }); }
    if (url.pathname === '/api/catalog' && window.__savedCards.length) return Response.json({ items: window.__savedCards });
    return window.__searchOriginalFetch(input, options);
  };
  return true;
`);
const input = value => evaluate(`
  const node = document.querySelector('[aria-label="Search GitHub"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, ${JSON.stringify(value)});
  node.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 50)); return true;
`);
const submit = () => evaluate(`document.querySelector('[aria-label="Add from GitHub"] form').requestSubmit(); return true;`);
try {
  input('limited'); submit(); command('wait', '--text', 'GitHub rate limit');
  input('https://example.com/repo'); submit(); command('wait', '--text', 'Use a GitHub repository URL');
  input('empty'); submit(); command('wait', '--text', 'No repositories found');
  input('slow'); submit(); command('wait', '--text', 'Searching GitHub and detecting');
  input('empty'); submit(); command('wait', '--text', 'No repositories found');
  evaluate('window.__slowSearch(); return true;');
  assert.equal(evaluate('return document.querySelectorAll(\'[aria-label="GitHub results"] article\').length;'), 0, 'Old searches must not replace newer results');
  input('https://github.com/example/review'); submit(); command('wait', '--selector', '[aria-label="Add example/review to Library"]');
  assert.match(evaluate('return document.querySelector(\'[aria-label="GitHub results"]\').textContent;'), /42 stars.*TypeScript.*2026-11-20.*Skill/s);
  evaluate('document.querySelector(\'[aria-label="Add example/review to Library"]\').click(); return true;');
  command('wait', '--text', 'In Library');
  assert.equal(evaluate('return document.querySelector(\'[aria-label="example/review is in Library"]\').disabled;'), true);
  assert.equal(evaluate('return window.__savedCards.length;'), 1);
  const dimensions = evaluate('return { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth };');
  assert.equal(dimensions.overflow, false);
  if (process.env.DOTCODE_UI_EVIDENCE_DIR) {
    const directory = process.env.DOTCODE_UI_EVIDENCE_DIR;
    mkdirSync(directory, { recursive: true });
    const prefix = path.join(directory, `github-${dimensions.width}`);
    writeFileSync(prefix + '.png', Buffer.from(command('screenshot').data, 'base64'));
    writeFileSync(prefix + '.json', JSON.stringify({ ...dimensions, fixture: true, states: ['rate limit', 'invalid URL', 'empty', 'loading', 'stale response', 'results', 'Add', 'In Library'] }, null, 2));
  }
  evaluate('document.querySelector(".discovery > footer button").click(); return true;');
  command('wait', '--selector', '.tool-card[aria-label="review"]');
  assert.match(evaluate('return document.querySelector(\'.tool-card[aria-label="review"]\').textContent;'), /Skill.*Not installed.*Install/s);
  console.log('GitHub UI checks passed.');
} finally {
  evaluate('window.fetch = window.__searchOriginalFetch; return true;');
}
