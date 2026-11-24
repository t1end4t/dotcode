import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GitHubSearch, GitHubResults } from '../frontend/src/components/GitHubSearch';
import { INITIAL_ITEMS } from '../frontend/src/data/items';

test('GitHub search exposes a labelled keyword/URL input and a search action without AI', () => {
  const html = renderToStaticMarkup(<GitHubSearch items={[]} onAdded={async () => {}} />);
  assert.match(html, /type="search"/);
  assert.match(html, /aria-label="Search GitHub"/);
  assert.match(html, /keyword or https:\/\/github.com\/owner\/repo/);
  assert.match(html, /type="submit"/);
  assert.match(html, />Search<\/button>/);
});

test('results show all requested metadata, Detector badges and duplicate-safe Add buttons', () => {
  const result = { ...INITIAL_ITEMS[0], iconUrl: 'https://avatars.githubusercontent.com/u/42?v=4', stars: 42, latestReleaseAt: '2026-11-20T12:00:00Z', detection: { checkedAt: '2026-11-21T12:00:00Z', commit: 'a'.repeat(40), badges: ['Skill'], skillPaths: [''] } };
  const html = renderToStaticMarkup(<GitHubResults results={[result]} items={[]} adding="" onAdd={() => {}} />);
  for (const text of [result.repo, result.description, result.primaryLanguage, '42 stars', 'Skill', '2026-11-20', `Add ${result.repo} to Library`]) assert.ok(html.includes(text), text);
  assert.ok(html.includes('<img src="https://avatars.githubusercontent.com/u/42?v=4"'));
  const added = renderToStaticMarkup(<GitHubResults results={[result]} items={[{ ...result, githubUrl: result.githubUrl.toUpperCase() + '.git/' }]} adding="" onAdd={() => {}} />);
  assert.match(added, /disabled=""/);
  assert.match(added, /In Library/);
  const empty = renderToStaticMarkup(<GitHubResults results={[]} items={[]} adding="" onAdd={() => {}} />);
  assert.match(empty, /No repositories found/);
});
