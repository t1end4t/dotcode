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
  window.__installRequests = [];
  window.__chatRequests = [];
  window.__slowSearch = null;
  window.__catalogReads = 0;
  window.__refreshAttempts = 0;
  window.__staleRefresh = false;
  window.__refreshRequests = [];
  const card = { id: 'fixture-review', name: 'review', repo: 'example/review', githubUrl: 'https://github.com/example/review', category: 'Skills', categoryLabel: 'Skills',
    description: 'UI test fixture: review code.', tags: ['review'], primaryLanguage: 'TypeScript', stars: 42, latestReleaseAt: '2026-11-20T12:00:00Z',
    defaultInstallCommand: '', customNotes: '', customCommand: '', detection: { checkedAt: new Date().toISOString(), commit: 'a'.repeat(40), badges: ['Skill'], skillPaths: ['skills/review'] } };
  const references = [['review-hook', 'Hook', 'Hooks'], ['review-library', 'Library', 'Libraries']].map(([name, badge, category]) => ({
    ...card, id: 'fixture-' + name, name, repo: 'example/' + name, githubUrl: 'https://github.com/example/' + name, category, categoryLabel: category,
    latestReleaseAt: badge === 'Hook' ? null : undefined,
    detection: { ...card.detection, badges: [badge], skillPaths: [] },
  }));
  const legacy = { ...references[0], id: 'fixture-legacy', name: 'review-legacy', repo: 'example/review-legacy', githubUrl: 'https://github.com/example/review-legacy' };
  const updated = { ...references[1], detection: { ...references[1].detection, commit: 'b'.repeat(40), badges: ['npm CLI'] } };
  window.fetch = async (input, options) => {
    const url = new URL(String(input), location.href);
    if (url.pathname === '/api/ai/chat') {
      window.__chatRequests.push(JSON.parse(options.body));
      if (window.__chatRequests.length === 1) return Response.json({ reply: 'The README describes a code review library.' });
      if (window.__chatRequests.length === 2) return Response.json({ error: 'Codex sign-in failed. Run codex login.' }, { status: 502 });
      throw new TypeError('Network error');
    }
    if (url.pathname === '/api/installer/search') {
      window.__searchCalls.push(url.searchParams.get('q'));
      const q = url.searchParams.get('q');
      if (q === 'slow') await new Promise(resolve => { window.__slowSearch = resolve; });
      if (q === 'limited') return Response.json({ error: 'GitHub rate limit. Retry later.' }, { status: 429 });
      if (q.startsWith('https://example.com')) return Response.json({ error: 'Use a GitHub repository URL.' }, { status: 400 });
      return Response.json({ results: q === 'empty' ? [] : q === 'references' ? [...references, legacy] : q === 'update' ? [updated] : [card], warning: 'No GitHub token found. Anonymous limits apply.' });
    }
    if (url.pathname === '/api/catalog/cards') {
      const request = JSON.parse(options.body);
      if (request.refreshDetection) {
        window.__refreshRequests.push(request.refreshDetection);
        const evidence = request.refreshDetection;
        if (JSON.stringify(evidence) !== JSON.stringify(updated.detection)) throw new Error('Refresh did not send the displayed evidence.');
        if (window.__staleRefresh) return Response.json({ error: 'This detection result is out of date. Search again before refreshing the Card.' }, { status: 409 });
        const index = window.__savedCards.findIndex(item => item.githubUrl === request.githubUrl);
        if (++window.__refreshAttempts === 1) {
          window.__savedCards[index] = { ...window.__savedCards[index], detection: evidence };
          throw new Error('Connection lost after saving.');
        }
        return Response.json({ item: window.__savedCards[index] });
      }
      const item = [card, ...references, legacy].find(item => item.githubUrl === request.githubUrl);
      window.__savedCards.push(item);
      return Response.json({ item }, { status: 201 });
    }
    if (url.pathname === '/api/installer/plan' || url.pathname === '/api/installer/execute') {
      window.__installRequests.push([url.pathname, JSON.parse(options.body)]);
      return Response.json(url.pathname.endsWith('/plan') ? { id: 'fixture-plan' } : { ok: true });
    }
    if (url.pathname === '/api/catalog' && window.__savedCards.length) {
      window.__catalogReads++;
      return Response.json({ items: window.__savedCards });
    }
    if (url.pathname === '/api/inventory') {
      return Response.json({ installations: [{ githubUrl: legacy.githubUrl, installed: true, version: '1.2.3', method: 'legacy', location: '/fixture/review' }] });
    }
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
const addButton = name => `[aria-label="Add example/${name} to Library"]`;
const cardSelector = name => `.tool-card[aria-label="${name}"]`;
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click(); return true;`);
const close = () => click('.discovery > footer button');
const open = () => click('.library-heading .button');
const capture = (name, states) => {
  const dimensions = evaluate('await document.fonts.ready; return { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth };');
  assert.equal(dimensions.overflow, false);
  if (process.env.DOTCODE_UI_EVIDENCE_DIR) {
    const directory = process.env.DOTCODE_UI_EVIDENCE_DIR;
    mkdirSync(directory, { recursive: true });
    const prefix = path.join(directory, `github-${dimensions.width}-${name}`);
    writeFileSync(prefix + '.png', Buffer.from(command('screenshot').data, 'base64'));
    writeFileSync(prefix + '.json', JSON.stringify({ ...dimensions, fixture: true, states }, null, 2));
  }
};
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
  input('references'); submit(); command('wait', '--selector', '[aria-label="example/review-hook"] .kind-label');
  assert.match(evaluate('return document.querySelector(\'[aria-label="example/review-hook"]\').textContent;'), /Latest release: No releases/);
  assert.match(evaluate('return document.querySelector(\'[aria-label="example/review-library"]\').textContent;'), /Latest release: Unavailable/);
  for (const [name, badge] of [['review-hook', 'Hook'], ['review-library', 'Library']]) {
    const selector = `[aria-label="example/${name}"]`;
    assert.equal(evaluate(`return document.querySelector('${selector} .kind-label').textContent;`), badge);
    assert.deepEqual(evaluate(`return Array.from(document.querySelectorAll('${selector} button'), button => button.textContent.trim());`), ['Add']);
    evaluate(`document.querySelector('${selector} button').click(); return true;`);
    command('wait', '--selector', `[aria-label="example/${name} is in Library"]`);
  }
  click(addButton('review-legacy'));
  command('wait', '--selector', '[aria-label="example/review-legacy is in Library"]');
  capture('search', ['rate limit', 'invalid URL', 'empty', 'loading', 'stale response', 'results', 'Add', 'In Library', 'Hook', 'Library']);
  close();
  for (const [name, badge] of [['review-hook', 'Hook'], ['review-library', 'Library']]) {
    const selector = `.tool-card[aria-label="${name}"]`;
    command('wait', '--selector', selector);
    assert.equal(evaluate(`return document.querySelector('${selector} .kind-label').textContent;`), badge);
    assert.equal(evaluate(`return document.querySelector('${selector} .status').textContent;`), 'Not installable');
    assert.deepEqual(evaluate(`return Array.from(document.querySelectorAll('${selector} footer button'), button => button.textContent.trim());`), ['Ask assistant']);
    evaluate(`document.querySelector('${selector} .ask-ai').click(); return true;`);
    assert.equal(evaluate('return document.querySelector(".chat-context .context-actions").textContent;'), 'Not installable');
  }
  const sendChat = value => evaluate(`
    const node = document.querySelector('#chat-input');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(node, ${JSON.stringify(value)});
    node.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 50));
    node.form.requestSubmit(); return true;
  `);
  sendChat('What does this repository do?');
  command('wait', '--text', 'The README describes a code review library.');
  assert.deepEqual(evaluate('return window.__chatRequests[0];'), {
    message: 'What does this repository do?', githubUrl: 'https://github.com/example/review-library', history: [],
  });
  sendChat('How do I use it?');
  command('wait', '--text', 'Codex sign-in failed.');
  assert.equal(evaluate('return document.querySelector("#chat-input").value;'), 'How do I use it?');
  click('[aria-label="Send message"]');
  command('wait', '--text', 'Could not reach DotCode.');
  assert.equal(evaluate('return window.__chatRequests[2].history.length;'), 2);
  click('[aria-label="Close assistant"]');
  const legacyCard = cardSelector('review-legacy');
  command('wait', '--selector', `${legacyCard} .status.enabled`);
  assert.match(evaluate(`return document.querySelector('${legacyCard}').textContent;`), /Installed · Enabled.*1\.2\.3.*Uninstall/s);
  assert.doesNotMatch(evaluate(`return document.querySelector('${legacyCard}').textContent;`), /Not installable/);
  assert.deepEqual(evaluate('return Array.from(document.querySelectorAll(".kind-filter option"), option => option.value);'),
    ['all', 'cli', 'desktop-app', 'skill', 'mcp']);
  const reads = evaluate('return window.__catalogReads;');
  const refresh = '[aria-label="Refresh detection for example/review-library"]';
  open();
  input('update'); submit(); command('wait', '--selector', refresh);
  assert.equal(evaluate('return window.__catalogReads;'), reads, 'Search must not refresh the catalog');
  capture('refresh', ['Search reports npm CLI for a saved Library', 'In Library and Refresh detection both visible']);
  close();
  assert.equal(evaluate(`return document.querySelector('${cardSelector('review-library')} .status').textContent;`), 'Not installable');
  open();
  input('update'); submit(); command('wait', '--selector', refresh);
  evaluate('window.__staleRefresh = true; return true;');
  click(refresh); command('wait', '--text', 'Search again');
  assert.equal(evaluate('return window.__refreshAttempts;'), 0);
  evaluate('window.__staleRefresh = false; return true;');
  submit(); command('wait', '--selector', refresh);
  click(refresh); command('wait', '--text', 'Connection lost after saving');
  click(refresh); command('wait', '--selector', '[aria-label="example/review-library is in Library"]');
  assert.equal(evaluate('return window.__refreshAttempts;'), 2);
  assert.equal(evaluate('return new Set(window.__refreshRequests.map(request => JSON.stringify(request))).size;'), 1);
  close();
  assert.match(evaluate(`return document.querySelector('${cardSelector('review-library')}').textContent;`), /CLI.*Not installed.*Install/s);
  capture('library', ['Cancel read-only search', 'Reject stale refresh', 'Retry after losing a save response', 'Updated CLI Card', 'Legacy installed controls']);
  assert.deepEqual(evaluate('return window.__installRequests;'), []);
  command('wait', '--selector', '.tool-card[aria-label="review"]');
  assert.match(evaluate('return document.querySelector(\'.tool-card[aria-label="review"]\').textContent;'), /Skill.*Not installed.*Install/s);
  assert.doesNotMatch(evaluate('return document.querySelector(\'.tool-card[aria-label="review"]\').textContent;'), /Skill directory/);
  evaluate('document.querySelector(\'.tool-card[aria-label="review"] .rt-button\').click(); return true;');
  command('wait', '--selector', '.tool-card[aria-label="review"] .rt-button:not(:disabled)');
  assert.deepEqual(evaluate('return window.__installRequests;'), [
    ['/api/installer/plan', { action: 'install', githubUrl: 'https://github.com/example/review' }],
    ['/api/installer/execute', { planId: 'fixture-plan' }],
  ]);
  console.log('GitHub UI checks passed.');
} finally {
  evaluate('window.fetch = window.__searchOriginalFetch; return true;');
}
