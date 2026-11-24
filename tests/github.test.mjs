import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInstaller } from '../backend/installer.mjs';
import express from 'express';
import { attachApi } from '../backend/api.mjs';

const commit = 'a'.repeat(40);
const metadata = { full_name: 'example/review', name: 'review', description: 'Review code.', language: 'TypeScript', stargazers_count: 42, topics: ['code-review'], owner: { avatar_url: 'https://avatars.githubusercontent.com/u/42?v=4' } };
const commandHooks = { hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: 'bash scripts/review.sh' }] }] } };
const contents = value => ({ content: Buffer.from(JSON.stringify(value)).toString('base64') });
async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-search-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const requests = [];
  const installer = createInstaller({ directory, env: {}, run: async () => ({ stdout: '' }), fetchRemote: async (url, options) => {
    requests.push([url, options]);
    const body = url.includes('/search/') ? { items: [metadata] }
      : url.includes('/commits/') ? { sha: commit }
      : url.includes('/git/trees/') ? { tree: [{ path: 'SKILL.md', type: 'blob', mode: '100644' }] }
      : url.endsWith('/releases/latest') ? { published_at: '2026-11-20T12:00:00Z', assets: [] } : metadata;
    return Response.json(body);
  }, ...options });
  return { installer, requests, directory };
}

test('search returns repository metadata, release date, Detector badges and an anonymous warning', async t => {
  const { installer, requests } = await fixture(t);
  const result = await installer.search('code review');
  assert.match(result.warning, /No GitHub token/);
  assert.equal(result.results.length, 1);
  const card = result.results[0];
  assert.equal(card.repo, 'example/review');
  assert.equal(card.stars, 42);
  assert.equal(card.primaryLanguage, 'TypeScript');
  assert.equal(card.description, 'Review code.');
  assert.equal(card.latestReleaseAt, '2026-11-20T12:00:00Z');
  assert.deepEqual(card.detection.badges, ['Skill']);
  assert.deepEqual(card.detection.skillPaths, ['']);
  assert.equal(card.detection.commit, commit);
  assert.ok(Number.isFinite(Date.parse(card.detection.checkedAt)));
  assert.equal(card.category, 'Skills');
  assert.equal(card.iconUrl, 'https://avatars.githubusercontent.com/u/42?v=4');
  assert.ok(requests.every(([url, options]) => new URL(url).origin === 'https://api.github.com' && options.redirect === 'error'));
});

test('repository URLs return exactly one result and invalid URLs never reach GitHub', async t => {
  const { installer, requests } = await fixture(t);
  assert.equal((await installer.search('https://github.com/Example/Review.git/')).results.length, 1);
  assert.ok(!requests.some(([url]) => url.includes('/search/')));
  const before = requests.length;
  for (const url of ['https://example.com/repo', 'https://github.com/a/b/issues', 'https://user:secret@github.com/a/b', 'http://github.com/a/b', 'https://github.com/a/..', 'https://github.com/a/b?token=secret', 'git@github.com:owner/repo.git', '//github.com/owner/repo']) {
    await assert.rejects(installer.search(url), /GitHub repository URL/);
  }
  assert.equal(requests.length, before);
  await installer.search('language:TypeScript');
  assert.ok(requests.some(([url]) => url.includes('q=language%3ATypeScript')));
  await installer.search('repo:example/review');
  assert.ok(requests.some(([url]) => url.includes('q=repo%3Aexample%2Freview')));
});

test('an undetectable repository keeps its metadata and does not hide healthy search results', async t => {
  const { installer } = await fixture(t, { fetchRemote: async url => {
    if (url.includes('/search/')) return Response.json({ items: [metadata, { ...metadata, full_name: 'example/empty', description: 'An empty repository.' }] });
    if (url.includes('/repos/example/empty/commits/')) return new Response(null, { status: 409 });
    if (url.includes('/commits/')) return Response.json({ sha: commit });
    if (url.includes('/git/trees/')) return Response.json({ tree: [{ path: 'SKILL.md', type: 'blob', mode: '100644' }] });
    if (url.includes('/releases/')) return new Response(null, { status: 404 });
    return Response.json({ ...metadata, full_name: 'example/empty', description: 'An empty repository.' });
  } });
  const { results } = await installer.search('review');
  assert.equal(results.length, 2);
  assert.deepEqual(results[0].detection.badges, ['Skill']);
  assert.deepEqual(results[1].detection.badges, ['Unknown']);
  assert.match(results[1].detection.error, /GitHub request failed/);
  assert.equal(results[1].description, 'An empty repository.');
  assert.equal((await installer.search('https://github.com/example/empty')).results.length, 1);
});

test('credentials prefer the environment, fall back to gh, and never enter results or errors', async t => {
  for (const useEnvironment of [true, false]) {
    let ghCalls = 0;
    const headers = [];
    const { installer } = await fixture(t, {
      env: useEnvironment ? { GITHUB_TOKEN: 'env-secret' } : { GH_HOST: 'github.example.com' },
      run: async (program, args) => { ghCalls++; assert.equal(program, 'gh'); assert.deepEqual(args, ['auth', 'token', '--hostname', 'github.com']); return { stdout: 'gh-secret\n' }; },
      fetchRemote: async (url, options) => {
        assert.equal(new URL(url).origin, 'https://api.github.com');
        headers.push(options.headers.authorization);
        return Response.json({ items: [] });
      },
    });
    assert.deepEqual(await installer.search('review'), { results: [], warning: '' });
    assert.equal(ghCalls, useEnvironment ? 0 : 1);
    assert.deepEqual(headers, [useEnvironment ? 'Bearer env-secret' : 'Bearer gh-secret']);
    assert.doesNotMatch(JSON.stringify(await installer.snapshot()), /env-secret|gh-secret/);
  }
  for (const status of [403, 429]) {
    const { installer } = await fixture(t, { fetchRemote: async () => new Response('env-secret', { status }) });
    await assert.rejects(installer.search('review'), /GitHub rate limit/);
  }
  const { installer } = await fixture(t, { env: { GITHUB_TOKEN: 'env-secret' }, fetchRemote: async () => { throw new Error('request headers: env-secret'); } });
  await assert.rejects(installer.search('review'), error => !error.message.includes('env-secret') && /connection/.test(error.message));
});

test('Search reports optional probe rate limits and retains confirmed results', async t => {
  for (const endpoint of ['/releases/latest', '/contents/package.json']) await t.test(endpoint, async t => {
    const { installer } = await fixture(t, {
      env: { GITHUB_TOKEN: 'fixture-token' }, fetchRemote: async url => {
        const path = new URL(url).pathname;
        if (path.endsWith(endpoint)) return new Response(null, { status: 429 });
        return Response.json(path.startsWith('/search/') ? { items: [metadata] }
          : path.includes('/commits/') ? { sha: commit }
          : path.includes('/git/trees/') ? { tree: ['SKILL.md', 'package.json'].map(path => ({ path, type: 'blob', mode: '100644' })) }
          : path.includes('/contents/') ? contents({ name: 'review' }) : metadata);
      },
    });
    for (const query of ['review', 'example/review']) {
      const { results, warning } = await installer.search(query);
      assert.deepEqual(results.map(card => card.detection.badges), [['Skill']]);
      assert.match(warning, /GitHub rate limit/);
    }
  });
});

test('Detector badges use manifests, release assets and topics, including unknown repositories and absent releases', async t => {
  for (const scenario of [
    { paths: ['flake.nix'], badges: ['Nix flake'], category: 'Developer tools' },
    { paths: ['package.json', 'cli.js'], pkg: { bin: { tool: 'cli.js' } }, badges: ['npm CLI'], category: 'Developer tools' },
    { paths: ['hooks/review.sh', 'package.json', 'cli.js'], pkg: { name: 'tool', main: 'index.js', bin: 'cli.js' }, badges: ['npm CLI'], category: 'Developer tools' },
    { paths: ['package.json', 'bin/tool'], pkg: { name: 'tool', directories: { bin: './bin/' } }, badges: ['npm CLI'], category: 'Developer tools' },
    { paths: ['hooks/hooks.json'], pkg: commandHooks, badges: ['Hook'], category: 'Hooks' },
    { paths: ['hooks/pre-commit'], executable: true, badges: ['Hook'], category: 'Hooks' },
    { paths: ['.codex/hooks.json'], pkg: commandHooks, badges: ['Hook'], category: 'Hooks' },
    { paths: ['.claude/hooks/review.py', 'hooks/review.sh'], badges: ['Unknown'], category: 'Other' },
    { paths: ['hooks/hooks.json', '.claude-plugin/plugin.json'], badges: ['Unknown'], category: 'Other' },
    { paths: ['hooks/review.sh', 'SKILL.md'], badges: ['Skill'], category: 'Skills' },
    { paths: ['package.json'], pkg: { name: 'helpers', exports: './index.js', bin: {} }, badges: ['Library'], category: 'Libraries' },
    { paths: ['package.json', 'hooks/useTheme.ts'], pkg: { name: 'workspace', private: true, workspaces: ['packages/*'] }, badges: ['Unknown'], category: 'Other' },
    { paths: ['package.json'], pkg: { dependencies: { '@modelcontextprotocol/sdk': '1' } }, badges: ['MCP'], category: 'MCP servers' },
    { paths: [], topics: ['mcp-server'], badges: ['MCP'], category: 'MCP servers' },
    { paths: [], assets: [{ name: 'tool.AppImage' }], badges: ['AppImage'], category: 'Desktop apps' },
    { paths: [], topics: ['security'], badges: ['Unknown'], category: 'security', noRelease: true },
  ]) {
    const { installer } = await fixture(t, { run: async program => ({ stdout: program === 'nix' ? JSON.stringify({ mainProgram: 'review', outputPath: '/nix/store/review' }) : '' }), fetchRemote: async url => {
      if (url.includes('/commits/')) return Response.json({ sha: commit });
      if (url.includes('/git/trees/')) return Response.json({ tree: scenario.paths.map(file => ({ path: file, type: 'blob', mode: scenario.executable ? '100755' : '100644' })) });
      if (url.includes('/contents/')) return Response.json(contents(scenario.pkg));
      if (url.includes('/releases/')) return scenario.noRelease ? new Response(null, { status: 404 }) : Response.json({ assets: scenario.assets ?? [] });
      return Response.json({ ...metadata, topics: scenario.topics ?? [] });
    } });
    const { results: [result] } = await installer.search('https://github.com/example/review');
    assert.deepEqual(result.detection.badges, scenario.badges);
    assert.equal(result.category, scenario.category);
    assert.equal(result.latestReleaseAt, null);
  }
});

test('Detector distinguishes websites and incidental hooks from declared standalone hooks', async t => {
  for (const [name, files, manifests, badge] of [
    ['named Vite website', ['package.json', 'index.html', 'src/main.js'], { 'package.json': { name: 'website', main: 'src/main.js', scripts: { dev: 'vite' }, devDependencies: { vite: '6' } } }, 'Unknown'],
    ['Node app with an executable Git hook', ['package.json', 'src/app.js', '.githooks/pre-commit'], {
      'package.json': { name: 'app', private: true, scripts: { start: 'node src/app.js' } },
    }, 'Unknown'],
    ...['server.js', 'index.js'].map(entry => [`Node app with root ${entry} and an executable Git hook`, ['package.json', entry, '.githooks/pre-commit'], {
      'package.json': { name: 'app', private: true },
    }, 'Unknown']),
    ['Go service with a hook test fixture', ['go.mod', 'hooks/test-fixture.sh'], {}, 'Unknown'],
    ['Go service with an incidental declared hook', ['go.mod', '.codex/hooks.json'], { '.codex/hooks.json': commandHooks }, 'Unknown'],
    ['setup.py package with an executable Git hook', ['setup.py', 'tool/__init__.py', '.githooks/pre-commit'], {}, 'Unknown'],
    ['Make project with an executable Git hook', ['Makefile', 'src/main.c', '.githooks/pre-commit'], {}, 'Unknown'],
    ['Gradle app with an incidental Claude hook', ['build.gradle', 'src/main/java/App.java', '.claude/settings.json'], { '.claude/settings.json': commandHooks }, 'Unknown'],
    ['shell sources with an incidental Claude hook', ['src/tool.sh', 'README.md', '.claude/settings.json'], { '.claude/settings.json': commandHooks }, 'Unknown'],
    ['documented Git hook with metadata', ['README.md', 'LICENSE', '.gitignore', '.github/workflows/ci.yml', 'docs/usage.md', '.githooks/pre-commit'], {}, 'Hook'],
    ['empty Codex manifest', ['.codex/hooks.json'], { '.codex/hooks.json': { hooks: {} } }, 'Unknown'],
    ['empty plugin-style hook manifest', ['hooks/hooks.json'], { 'hooks/hooks.json': {} }, 'Unknown'],
    ['implicit-entry Library with incidental hook', ['package.json', 'index.js', '.claude/settings.json'], {
      'package.json': { name: 'helpers' }, '.claude/settings.json': commandHooks,
    }, 'Library'],
    ['prompt-only Claude hook', ['.claude/settings.json'], {
      '.claude/settings.json': { hooks: { Stop: [{ hooks: [{ type: 'prompt', prompt: 'Review the result.' }] }] } },
    }, 'Hook'],
    ['Claude settings hook outside hooks directory', ['.claude/settings.json', 'scripts/review.sh'], {
      '.claude/settings.json': { hooks: { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'bash "$CLAUDE_PROJECT_DIR/scripts/review.sh"' }] }] } },
    }, 'Hook'],
  ]) await t.test(name, async t => {
    const { installer } = await fixture(t, { fetchRemote: async url => {
      if (url.includes('/commits/')) return Response.json({ sha: commit });
      if (url.includes('/git/trees/')) return Response.json({ tree: files.map(path => ({ path, type: 'blob', mode: path === '.githooks/pre-commit' ? '100755' : '100644' })) });
      if (url.includes('/contents/')) {
        const path = new URL(url).pathname.split('/contents/')[1];
        return Response.json(contents(manifests[path]));
      }
      if (url.includes('/releases/')) return new Response(null, { status: 404 });
      return Response.json({ ...metadata, topics: [] });
    } });
    const { results: [result] } = await installer.search('https://github.com/example/review');
    assert.deepEqual(result.detection.badges, [badge]);
    assert.equal(result.category, { Hook: 'Hooks', Library: 'Libraries' }[badge] ?? 'Other');
  });
});

test('Search and Detect use runnable evidence ahead of reference badges', async t => {
  const githubUrl = 'https://github.com/example/review';
  const npm = { name: 'review', exports: './index.js' };
  const cargo = '[package]\nname = "review"\nversion = "1.0.0"\n';
  const python = '[project]\nname = "review"\nversion = "1.0.0"\n';
  for (const [name, files, manifest, badge, topic, flakePackage] of [
    ['development flake', ['package.json', 'index.js', 'flake.nix'], npm, 'Library'],
    ['library-only default derivation', ['package.json', 'index.js', 'flake.nix'], npm, 'Library', undefined,
      { mainProgram: null, pname: 'review', outputName: 'out', outputPath: '/nix/store/review' }],
    ['normalized npm bin', ['package.json', 'index.js', 'bin/review.js'], { name: 'review', main: 'index.js', bin: '././bin/review.js' }, 'npm CLI'],
    ['dangling npm bin', ['package.json', 'index.js'], { ...npm, bin: './missing.js' }, 'Library'],
    ['empty npm bin', ['package.json', 'index.js', 'empty.js'], { ...npm, bin: './empty.js' }, 'Library'],
    ['npm bin generated by a build script', ['package.json', 'index.js'], { ...npm, bin: './cli.js', scripts: { build: 'tsc' } }, 'npm CLI'],
    ['npm bin generated under lib', ['package.json', 'index.js'], { ...npm, bin: { review: '././lib/cli.mjs' } }, 'npm CLI'],
    ['empty built npm bin', ['package.json', 'index.js', 'lib/empty.js'], { ...npm, bin: './lib/empty.js', scripts: { build: 'tsc' } }, 'Library'],
    ['library with a demo page', ['package.json', 'index.js', 'index.html'], npm, 'Library'],
    ['private npm app with a declared main and incidental hook', ['package.json', 'src/server.js', '.githooks/pre-commit'],
      { name: 'review', private: true, main: 'src/server.js' }, 'Unknown'],
    ['shell CLI with an incidental Git hook', ['bin/review', '.githooks/pre-commit'], undefined, 'Unknown'],
    ['Cargo library', ['Cargo.toml', 'src/lib.rs'], cargo, 'Library'],
    ['Cargo executable', ['Cargo.toml', 'src/lib.rs', 'src/main.rs'], cargo, 'Unknown'],
    ['Cargo custom bin', ['Cargo.toml', 'src/lib.rs', 'tools/cli.rs'], cargo + '[[bin]]\nname = "review"\npath = "tools/cli.rs"\n', 'Unknown'],
    ['Python library', ['pyproject.toml', 'src/review/__init__.py'], python, 'Library'],
    ['Python console script', ['pyproject.toml', 'src/review/__init__.py'], python + '[project.scripts]\nreview = "review:main"\n', 'Unknown'],
    ['MCP topic on a package with exports', ['package.json', 'index.js'], npm, 'MCP', 'mcp-server'],
  ]) await t.test(name, async t => {
    let nixpkgsReads = 0;
    const { installer } = await fixture(t, {
      fetchRemote: async url => Response.json(url.includes('/commits/') ? { sha: commit }
        : url.includes('/git/trees/') ? { tree: files.map(path => ({ path, type: 'blob', mode: ['.githooks/pre-commit', 'bin/review'].includes(path) ? '100755' : '100644', size: path.endsWith('empty.js') ? 0 : 200 })) }
        : url.includes('/contents/') ? typeof manifest === 'string' ? { content: Buffer.from(manifest).toString('base64') } : contents(manifest)
        : url.includes('/releases/') ? { assets: [] } : { ...metadata, topics: topic ? [topic] : [] }),
      run: async (program, args) => {
        if (program === 'gh') return { stdout: '' };
        if (args.some(arg => arg.startsWith('github:example/'))) {
          assert.ok(args.includes(`github:example/review/${commit}#`));
          if (flakePackage) return { stdout: JSON.stringify(flakePackage) };
          throw Object.assign(new Error('flake does not provide a default package'), {
            stderr: `error: flake 'github:example/review/${commit}' does not provide attribute 'packages.x86_64-linux.default' or 'defaultPackage.x86_64-linux'`,
          });
        }
        nixpkgsReads++;
        return { stdout: JSON.stringify(args[0] === 'search' ? { review: {} } : { homepage: githubUrl }) };
      },
    });
    assert.deepEqual((await installer.search(githubUrl)).results[0].detection.badges, [badge]);
    const { candidates } = await installer.detect({ githubUrl });
    assert.deepEqual(candidates.map(({ recipe }) => recipe.source.type), badge === 'Library' ? [] : ['nixpkgs']);
    if (badge === 'Library') assert.equal(nixpkgsReads, 0);
    if (flakePackage) await assert.rejects(installer.plan({ action: 'install', githubUrl,
      recipe: { backend: 'nix', source: { githubUrl, type: 'flake', attribute: '' } },
    }), { code: 'INVALID_INPUT' });
  });
});

test('unavailable manifests leave classification Unknown and preserve nixpkgs Detect and Plan', async t => {
  for (const [file, status] of [
    ['package.json', 200], ['package.json', 503], ['.claude/settings.json', 200], ['.claude/settings.json', 503],
  ]) await t.test(`${file}: ${status === 200 ? 'malformed JSON' : 'unreadable file'}`, async t => {
    const githubUrl = 'https://github.com/example/review';
    const tree = [{ path: file, type: 'blob', mode: '100644' }];
    if (file === 'package.json') tree.push({ path: '.githooks/pre-commit', type: 'blob', mode: '100755' });
    const { installer } = await fixture(t, {
      fetchRemote: async url => {
        if (url.includes('/contents/')) return status === 200
          ? Response.json({ content: Buffer.from('{').toString('base64') }) : new Response(null, { status });
        return Response.json(url.includes('/commits/') ? { sha: commit } : url.includes('/git/trees/') ? { tree } : metadata);
      },
      run: async (program, args) => ({ stdout: program === 'gh' ? '' : JSON.stringify(args[0] === 'search' ? { review: {} }
        : args[0] === 'flake' ? { locked: { rev: commit } } : { homepage: githubUrl, mainProgram: 'review', outputPath: '/nix/store/review' }) }),
    });
    const { candidates, warnings } = await installer.detect({ githubUrl });
    assert.deepEqual(candidates.map(({ recipe }) => recipe.source.type), ['nixpkgs']);
    assert.ok(warnings.some(warning => warning.includes(file)));
    const { detection } = (await installer.search(githubUrl)).results[0];
    assert.deepEqual(detection.badges, ['Unknown']);
    assert.equal(detection.commit, commit);
    assert.equal((await installer.plan({ action: 'install', githubUrl, recipe: candidates[0].recipe })).version, commit);
  });
});

test('Detect and Plan preserve a verified default flake through unrelated GitHub failures', async t => {
  for (const broken of ['package.json', 'releases/latest', 'repository metadata']) await t.test(broken, async t => {
    const githubUrl = 'https://github.com/example/review';
    const { installer } = await fixture(t, {
      fetchRemote: async url => {
        if (url.includes('/commits/')) return Response.json({ sha: commit });
        if (url.includes('/git/trees/')) return Response.json({ tree: (broken === 'package.json' ? ['flake.nix', 'package.json'] : ['flake.nix']).map(
          path => ({ path, type: 'blob', mode: '100644' })) });
        if (url.includes('/contents/')) return Response.json({ content: '!' });
        if (url.endsWith('/releases/latest') ? broken === 'releases/latest' : broken === 'repository metadata') return new Response(null, { status: 503 });
        return Response.json(metadata);
      },
      run: async (program, args) => ({ stdout: program === 'gh' ? '' : args[0] === 'search' ? '{}' :
        JSON.stringify({ mainProgram: 'review', outputPath: '/nix/store/review' }) }),
    });
    const { candidates } = await installer.detect({ githubUrl });
    assert.deepEqual(candidates.map(({ recipe }) => recipe.source.type), ['flake']);
    assert.equal((await installer.plan({ action: 'install', githubUrl, recipe: candidates[0].recipe })).version, commit);
    if (broken === 'releases/latest') {
      const { results: [card] } = await installer.search(githubUrl);
      assert.deepEqual(card.detection.badges, ['Nix flake']);
      assert.equal(card.latestReleaseAt, undefined);
    }
  });
});

test('Search stays read-only during installer work; explicit refresh updates a saved Card and is safe to retry', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-hook-refresh-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let scenario = 'Unknown';
  const pause = Promise.withResolvers();
  const started = Promise.withResolvers();
  const app = express().use(express.json());
  const stop = attachApi(app, { directory, installerOptions: {
    env: {}, run: async () => ({ stdout: '' }), fetchRemote: async url => {
      if (url.endsWith('/commits/hold')) { started.resolve(); await pause.promise; }
      const paths = scenario === 'Unknown' ? [] : scenario === 'Hook' ? ['.codex/hooks.json'] : ['package.json', 'index.js'];
      const body = url.includes('/commits/') ? { sha: ({ Hook: 'b', Library: 'c', 'npm CLI': 'd' }[scenario] ?? 'a').repeat(40) }
        : url.includes('/git/trees/') ? { tree: paths.map(path => ({ path, type: 'blob', mode: '100644' })) }
        : url.includes('/contents/.codex/hooks.json') ? contents(commandHooks)
        : url.includes('/contents/package.json') ? contents({ name: 'review', ...(scenario === 'npm CLI' && { bin: 'index.js' }) })
        : url.includes('/search/') ? { items: [metadata] } : metadata;
      return Response.json(body);
    },
  } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await stop(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const search = async () => {
    const response = await fetch(base + '/api/installer/search?q=review');
    assert.equal(response.status, 200);
    return response.json();
  };
  const before = { ...(await search()).results[0], name: 'My review tool', customNotes: 'Keep this note', kind: 'cli' };
  assert.deepEqual(before.detection.badges, ['Unknown']);
  assert.equal((await fetch(base + '/api/catalog', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [before] }) })).status, 200);
  const file = path.join(directory, 'catalog.json');
  const inventoryFile = path.join(directory, 'inventory.json');
  const inventory = JSON.stringify({ installations: [{ githubUrl: before.githubUrl, installed: true }], runs: [] });
  await writeFile(inventoryFile, inventory);
  const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const busy = post('/api/installer/detect', { githubUrl: before.githubUrl, ref: 'hold' });
  try {
    await started.promise;
    scenario = 'Hook';
    const original = await readFile(file, 'utf8');
    assert.deepEqual((await search()).results[0].detection.badges, ['Hook']);
    assert.equal(await readFile(file, 'utf8'), original);
  } finally { pause.resolve(); await busy; }
  const refreshRequest = detection => ({ githubUrl: before.githubUrl, refreshDetection: detection });
  const tabA = (await search()).results[0].detection;
  const refreshBody = JSON.stringify(refreshRequest(tabA));
  const original = await readFile(file, 'utf8');
  for (const [headers, status] of [[{ 'content-type': 'application/json', origin: 'https://evil.example' }, 403], [{}, 415]]) {
    assert.equal((await fetch(base + '/api/catalog/cards', { method: 'POST', headers, body: refreshBody })).status, status);
    assert.equal(await readFile(file, 'utf8'), original);
  }
  const altered = await post('/api/catalog/cards', refreshRequest({ ...tabA, badges: ['Library'] }));
  assert.equal(altered.status, 409);
  assert.equal(await readFile(file, 'utf8'), original);
  scenario = 'Library';
  await search();
  let response = await post('/api/catalog/cards', refreshRequest(tabA));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /search again/i);
  assert.equal(await readFile(file, 'utf8'), original);
  let saved = before;
  for (scenario of ['Hook', 'Library', 'npm CLI', 'Unknown']) {
    const original = await readFile(file, 'utf8');
    const evidence = (await search()).results[0].detection;
    assert.deepEqual(evidence.badges, [scenario]);
    assert.equal(await readFile(file, 'utf8'), original);
    const refresh = () => post('/api/catalog/cards', refreshRequest(evidence));
    const first = await refresh();
    assert.equal(first.status, 200);
    const { item } = await first.json();
    assert.deepEqual(item.detection, evidence);
    assert.deepEqual(item, { ...saved, detection: item.detection });
    const refreshed = await readFile(file, 'utf8');
    const current = scenario;
    scenario = current === 'Hook' ? 'Library' : 'Hook';
    await search();
    scenario = current;
    assert.deepEqual(await (await refresh()).json(), { item });
    assert.equal(await readFile(file, 'utf8'), refreshed);
    assert.deepEqual((await (await fetch(base + '/api/catalog')).json()).items, [item]);
    saved = item;
  }
  assert.equal(await readFile(inventoryFile, 'utf8'), inventory);
});

test('an unavailable release probe cannot replace a saved AppImage detection', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-appimage-refresh-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let releaseStatus = 200, clock = Date.now();
  const app = express().use(express.json());
  const stop = attachApi(app, { directory, installerOptions: {
    env: {}, now: () => clock, run: async () => ({ stdout: '' }), fetchRemote: async url => {
      if (url.endsWith('/releases/latest')) return releaseStatus === 200
        ? Response.json({ assets: [{ name: 'review.AppImage' }] }) : new Response(null, { status: releaseStatus });
      return Response.json(url.includes('/commits/') ? { sha: commit }
        : url.includes('/git/trees/') ? { tree: ['package.json', 'electron.js'].map(path => ({ path, type: 'blob', mode: '100644' })) }
        : url.includes('/contents/') ? contents({ name: 'review', main: 'electron.js', devDependencies: { electron: '39' } }) : metadata);
    },
  } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await stop(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const githubUrl = 'https://github.com/example/review';
  const search = async () => (await (await fetch(base + '/api/installer/search?q=example/review')).json()).results[0];
  const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.deepEqual((await search()).detection.badges, ['AppImage']);
  const added = await post('/api/catalog/cards', { githubUrl });
  assert.equal(added.status, 201);
  const { item } = await added.json();

  releaseStatus = 503;
  const { detection } = await search();
  assert.deepEqual(detection.badges, ['Unknown']);
  assert.match(detection.error, /latest GitHub release/);
  assert.equal((await post('/api/catalog/cards', { githubUrl, refreshDetection: detection })).status, 400);
  clock += 25 * 60 * 60 * 1000;
  const plan = await post('/api/installer/plan', { action: 'install', githubUrl });
  assert.equal((await plan.json()).code, 'NOT_SKILL');
  assert.deepEqual((await (await fetch(base + '/api/catalog')).json()).items, [item]);

  releaseStatus = 404;
  const confirmed = (await search()).detection;
  assert.deepEqual(confirmed.badges, ['Library']);
  assert.equal((await post('/api/catalog/cards', { githubUrl, refreshDetection: confirmed })).status, 200);
});

test('incomplete flake and npm probes preserve saved detection and the nixpkgs fallback', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-partial-refresh-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const githubUrl = 'https://github.com/example/review';
  let flakeFails = false, manifestFails = false;
  const app = express().use(express.json());
  const stop = attachApi(app, { directory, installerOptions: {
    env: {}, fetchRemote: async url => {
      if (manifestFails && url.includes('/contents/')) return new Response(null, { status: 503 });
      return Response.json(url.includes('/commits/') ? { sha: commit }
        : url.includes('/git/trees/') ? { tree: ['flake.nix', 'package.json', 'index.js'].map(path => ({ path, type: 'blob', mode: '100644' })) }
        : url.includes('/contents/') ? contents({ name: 'review', exports: './index.js' }) : metadata);
    },
    run: async (program, args) => {
      if (program === 'gh') return { stdout: '' };
      if (flakeFails && args[2]?.startsWith('github:example/')) throw new Error('Nix evaluator unavailable');
      return { stdout: JSON.stringify(args[0] === 'search' ? { review: {} }
        : args[0] === 'flake' ? { locked: { rev: commit } } : { homepage: githubUrl, mainProgram: 'review', outputPath: '/nix/store/review' }) };
    },
  } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await stop(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const added = await post('/api/catalog/cards', { githubUrl });
  assert.equal(added.status, 201);
  const { item } = await added.json();
  assert.deepEqual(item.detection.badges, ['Nix flake']);

  for (const [flake, manifest, badge, label] of [
    [true, false, 'Library', /repository flake/],
    [false, true, 'Nix flake', /package\.json/],
    [true, true, 'Unknown', /package\.json/],
  ]) await t.test(`${badge} with failed ${label.source} probe`, async () => {
    flakeFails = flake;
    manifestFails = manifest;
    const { results: [{ detection }] } = await (await fetch(base + '/api/installer/search?q=example/review')).json();
    assert.deepEqual(detection.badges, [badge]);
    assert.equal((await post('/api/catalog/cards', { githubUrl, refreshDetection: detection })).status, 400);
    assert.match(detection.error, label);
    assert.deepEqual((await (await fetch(base + '/api/catalog')).json()).items, [item]);
    const { candidates } = await (await post('/api/installer/detect', { githubUrl })).json();
    const fallback = candidates.find(({ recipe }) => recipe.source.type === 'nixpkgs');
    assert.ok(fallback);
    assert.equal((await post('/api/installer/plan', { action: 'install', githubUrl, recipe: fallback.recipe })).status, 200);
  });
});

test('late searches cannot invalidate the displayed detection at Refresh', async t => {
  for (const cancelled of [false, true]) await t.test(cancelled ? 'cancelled' : 'superseded', async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-search-order-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const started = Promise.withResolvers(), release = Promise.withResolvers(), closed = Promise.withResolvers();
    const app = express().use((req, res, next) => {
      if (req.query.q === 'held') res.once('close', closed.resolve);
      next();
    });
    const stop = attachApi(app, { directory, installerOptions: {
      env: {}, run: async () => ({ stdout: '' }), fetchRemote: async url => {
        if (new URL(url).searchParams.get('q') === 'held') {
          started.resolve();
          await release.promise;
          return Response.json({ items: [] });
        }
        return Response.json(url.includes('/search/') ? { items: [metadata] } : url.includes('/commits/') ? { sha: commit }
          : url.includes('/git/trees/') ? { tree: [{ path: 'package.json', type: 'blob', mode: '100644' }] }
          : url.includes('/contents/') ? contents({ name: 'review', exports: './index.js' }) : metadata);
      },
    } });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(async () => { await stop(); await new Promise(resolve => server.close(resolve)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const send = (method, route, body) => fetch(base + route, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const search = query => fetch(base + '/api/installer/search?q=' + query).then(response => response.json());
    const { results: [card] } = await search('review');
    assert.equal((await send('PUT', '/api/catalog', { items: [{ ...card, detection: { ...card.detection, badges: ['Unknown'] } }] })).status, 200);
    const controller = new AbortController();
    const start = () => fetch(base + '/api/installer/search?q=held', { signal: controller.signal }).then(response => response.json(), error => error);
    const older = cancelled ? null : start();
    try {
      if (older) await started.promise;
      const { results: [newer] } = await search('review');
      if (cancelled) {
        const pending = start();
        await started.promise;
        controller.abort();
        assert.equal((await pending).name, 'AbortError');
        await closed.promise;
      }
      release.resolve();
      if (older) assert.deepEqual((await older).results, []);
      else await new Promise(setImmediate); // Let the held in-memory GitHub response finish on the server.
      const refreshed = await send('POST', '/api/catalog/cards', { githubUrl: newer.githubUrl, refreshDetection: newer.detection });
      assert.equal(refreshed.status, 200);
      assert.deepEqual((await refreshed.json()).item.detection, newer.detection);
    } finally { release.resolve(); }
  });
});

test('HTTP Add persists Detector metadata, deduplicates canonical repos and never calls AI', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-add-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let offline = false;
  const hook = { ...metadata, full_name: 'example/review-hook', name: 'review-hook' };
  const library = { ...metadata, full_name: 'example/review-library', name: 'review-library' };
  const app = express().use(express.json());
  const stop = attachApi(app, { directory, installerOptions: {
    env: { GITHUB_TOKEN: 'http-test-secret' }, run: async () => ({ stdout: '' }), fetchRemote: async url => {
      if (offline) throw new Error('GitHub became unavailable after search');
      return Response.json(url.includes('/search/') ? { items: [metadata, hook, library] } : url.includes('/commits/') ? { sha: commit }
        : url.includes('/git/trees/') ? { tree: [{
          path: url.includes('/review-hook/') ? '.codex/hooks.json' : url.includes('/review-library/') ? 'package.json' : 'SKILL.md',
          type: 'blob', mode: '100644',
        }] }
        : url.includes('/contents/') ? contents(url.includes('/review-hook/') ? commandHooks : { name: 'review-library', main: 'index.js' })
        : url.endsWith('/releases/latest') ? { published_at: '2026-11-20T12:00:00Z', assets: [] } : metadata);
    },
  } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await stop(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const add = githubUrl => fetch(base + '/api/catalog/cards', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ githubUrl }) });
  const search = await fetch(base + '/api/installer/search?q=review');
  assert.equal(search.status, 200);
  assert.equal(search.headers.get('cache-control'), 'no-store');
  const { results } = await search.json();
  assert.deepEqual(results.map(card => card.detection.badges), [['Skill'], ['Hook'], ['Library']]);
  offline = true;
  const response = await add('https://github.com/Example/Review.git/');
  assert.equal(response.status, 201);
  const { item } = await response.json();
  assert.equal(item.category, 'Skills');
  assert.equal(item.iconUrl, 'https://avatars.githubusercontent.com/u/42?v=4');
  assert.deepEqual(item.detection.badges, ['Skill']);
  assert.equal((await add('https://github.com/example/review')).status, 200);
  for (const result of results.slice(1)) {
    assert.equal(result.kind, undefined);
    assert.equal(result.recipe, undefined);
    assert.equal(result.defaultInstallCommand, '');
    const response = await add(result.githubUrl);
    assert.equal(response.status, 201);
    assert.deepEqual((await response.json()).item, result);
  }
  const saved = await (await fetch(base + '/api/catalog')).json();
  assert.deepEqual(saved.items, results);
  assert.doesNotMatch(JSON.stringify(saved), /http-test-secret/);
  assert.doesNotMatch(JSON.stringify(await (await fetch(base + '/api/installer')).json()), /http-test-secret/);
  assert.equal((await add('https://example.com/repo')).status, 400);
  assert.equal((await fetch(base + '/api/catalog/cards', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify({ githubUrl: item.githubUrl }) })).status, 403);
});

test('saved Cards preserve explicit Kind and GitHub icons and reject unsupported metadata', async t => {
  const { installer, directory } = await fixture(t);
  const card = { ...await installer.inspect('https://github.com/example/review'), kind: 'desktop-app', iconUrl: 'https://raw.githubusercontent.com/example/review/main/icon.png' };
  const app = express().use(express.json());
  const stop = attachApi(app, { directory });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await stop(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const save = item => fetch(base + '/api/catalog', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [item] }) });
  for (const invalid of [
    { ...card, kind: 'anything' },
    ...['javascript:alert(1)', 'https://example.com/icon.png', 'https://raw.githubusercontent.com.evil.test/icon.png', 'https://user:secret@raw.githubusercontent.com/example/review/main/icon.png'].map(iconUrl => ({ ...card, iconUrl })),
  ]) {
    assert.equal((await save(invalid)).status, 400);
  }
  assert.equal((await save(card)).status, 200);
  assert.deepEqual((await (await fetch(base + '/api/catalog')).json()).items, [card]);
});

test('Nix detection and planning reject reference-only repos even if nixpkgs links to them', async t => {
  let manifest = 'package.json';
  const nix = [];
  const { installer, directory } = await fixture(t, {
    fetchRemote: async url => Response.json(url.includes('/commits/') ? { sha: commit }
      : url.includes('/git/trees/') ? { tree: [{ path: manifest, type: 'blob', mode: '100644' }] }
      : url.includes('/contents/') ? contents(manifest === 'package.json' ? { name: 'review', exports: './index.js' } : commandHooks)
      : url.includes('/releases/') ? { assets: [] } : metadata),
    run: async (command, args) => {
      if (command === 'gh') return { stdout: '' };
      nix.push(args);
      return { stdout: JSON.stringify(args[0] === 'search' ? { 'legacyPackages.x86_64-linux.review': {} }
        : args[0] === 'flake' ? { locked: { rev: commit } } : { homepage: 'https://github.com/example/review', mainProgram: 'review', outputPath: path.join(directory, 'result') }) };
    },
  });
  for (const [file, badge] of [['package.json', 'Library'], ['.codex/hooks.json', 'Hook']]) {
    manifest = file;
    const githubUrl = 'https://github.com/example/review';
    assert.deepEqual((await installer.search(githubUrl)).results[0].detection.badges, [badge]);
    assert.deepEqual((await installer.detect({ githubUrl })).candidates, []);
    const ref = 'v1';
    await assert.rejects(installer.plan({ action: 'install', githubUrl, ref,
      recipe: { backend: 'nix', source: { githubUrl, ref, type: 'nixpkgs', attribute: 'review' } } }), { code: 'INVALID_INPUT' });
  }
  assert.deepEqual(nix, []);
});

test('Install reuses saved detection for 24 hours, then refreshes and persists it before planning', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dotcode-refresh-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let clock = Date.parse('2026-11-21T12:00:00Z');
  let revision = commit;
  const requests = [];
  const app = express().use(express.json());
  const stop = attachApi(app, { directory, installerOptions: {
    home: directory + '-home', env: {}, now: () => clock, run: async (program, args) => ({
      stdout: program === 'nix' && args[0] === 'eval'
        ? JSON.stringify({ mainProgram: 'review', outputPath: directory + '/nix-output' })
        : program === 'nix' ? '{}' : '',
    }),
    fetchRemote: async url => {
      requests.push(url);
      return Response.json(url.includes('/commits/') ? { sha: revision }
        : url.includes('/git/trees/') ? { tree: [{ path: revision === commit ? 'SKILL.md' : 'skills/review/SKILL.md', type: 'blob', mode: '100644' }, { path: 'flake.nix', type: 'blob', mode: '100644' }] }
        : url.endsWith('/releases/latest') ? { assets: [] } : metadata);
    },
  } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await stop(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post('/api/catalog/cards', { githubUrl: 'https://github.com/example/review' })).status, 201);
  requests.length = 0;
  clock += 24 * 60 * 60 * 1000;
  let response = await post('/api/installer/plan', { action: 'install', githubUrl: 'https://github.com/example/review' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).version, commit);
  assert.equal(requests.length, 0);
  clock++;
  revision = 'b'.repeat(40);
  response = await post('/api/installer/plan', { action: 'install', githubUrl: 'https://github.com/example/review' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).version, revision);
  assert.ok(requests.some(url => url.includes('/commits/')));
  const { items } = await (await fetch(base + '/api/catalog')).json();
  assert.equal(items[0].detection.commit, revision);
  assert.deepEqual(items[0].detection.skillPaths, ['skills/review']);
  assert.equal(items[0].detection.checkedAt, '2026-11-22T12:00:00.001Z');

  const githubUrl = items[0].githubUrl;
  const detected = await post('/api/installer/detect', { githubUrl });
  assert.equal(detected.status, 200);
  const { candidates: [{ recipe }] } = await detected.json();
  assert.equal(recipe.backend, 'nix');
  const cliPlan = await post('/api/installer/plan', { action: 'install', githubUrl, recipe });
  assert.equal(cliPlan.status, 200);
  assert.equal((await cliPlan.json()).version, revision);
});
