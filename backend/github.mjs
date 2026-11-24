import { execFile } from 'node:child_process';
import { posix } from 'node:path';
import { promisify } from 'node:util';

const invalid = () => Object.assign(new Error('Use a GitHub repository URL such as https://github.com/owner/repo.'), { code: 'INVALID_INPUT' });
const nonempty = value => typeof value === 'string' && Boolean(value.trim());
const hasExport = value => nonempty(value) || Boolean(value && typeof value === 'object' && Object.values(value).some(hasExport));
const repoTopics = metadata => Array.isArray(metadata?.topics) ? metadata.topics.filter(topic => typeof topic === 'string').slice(0, 50) : [];
const releaseDate = release => release === undefined ? undefined : release?.published_at ?? null;
const releaseLabel = 'the latest GitHub release';
const isRateLimit = status => status === 403 || status === 429;
const rateLimitWarning = 'GitHub rate limit or access restriction. Wait and retry, or configure GITHUB_TOKEN.';
const npmBinPath = file => posix.join('/', file.replace(/[\\:]/g, '/')).slice(1);
// ponytail: a standalone Hook repo holds only hook files, support scripts, docs and metadata; widen when real hook repos carry more.
const hookRepoFile = /^(?:(?:hooks|\.?githooks|\.claude|\.codex|scripts|docs|\.github)\/.+|[^/]+\.md|(?:LICENSE|COPYING)[^/]*|\.[^/]+|package(?:-lock)?\.json|flake\.(?:nix|lock))$/i;
// ponytail: recognize conventional single-package layouts; use a TOML parser for custom packaging layouts.
const cargoLibrary = (paths, manifest) => /^\s*\[\s*package\s*\]/m.test(manifest) && !/(?:\[\s*\[\s*|^\s*)["']?bin["']?\s*(?:\]|=)/m.test(manifest) &&
  !paths.has('src/main.rs') && ![...paths].some(file => /^(?:src\/bin\/|.+\/Cargo\.toml$)/.test(file));
const pythonLibrary = (paths, manifest) => {
  const project = manifest.match(/^\s*\[\s*project\s*\][^\S\n]*\n([^[]*)/m)?.[1];
  const name = project?.match(/^\s*name\s*=\s*["']([\w.-]+)["']/m)?.[1].toLowerCase().replace(/[.-]/g, '_');
  return name && !/\b(?:scripts|entry[-_]points)\b/.test(manifest) && !paths.has('setup.py') && !paths.has('setup.cfg') &&
    ![...paths].some(file => /\/(?:__main__\.py|pyproject\.toml)$/.test(file)) &&
    [name, `src/${name}`].some(base => paths.has(`${base}/__init__.py`) || paths.has(`${base}.py`));
};
const gitHook = /^(?:hooks|\.?githooks)\/([^/]+)$/;
const gitHookNames = new Set('applypatch-msg pre-applypatch post-applypatch pre-commit pre-merge-commit prepare-commit-msg commit-msg post-commit pre-rebase post-checkout post-merge pre-push pre-receive update proc-receive post-receive post-update reference-transaction push-to-checkout pre-auto-gc post-rewrite sendemail-validate fsmonitor-watchman p4-changelist p4-prepare-changelist p4-post-changelist p4-pre-submit post-index-change'.split(' '));
const hookFields = new Map([['command', 'command'], ['prompt', 'prompt'], ['agent', 'prompt'], ['http', 'url']]);
const hasHook = (manifest, codex) => Object.values(manifest?.hooks ?? {}).some(groups => Array.isArray(groups) && groups.some(group =>
  Array.isArray(group?.hooks) && group.hooks.some(handler => {
    const field = hookFields.get(handler?.type);
    return field && (!codex || handler.type === 'command') && nonempty(handler[field]);
  })));
export const referenceBadge = badges => badges?.length === 1 && ['Hook', 'Library'].includes(badges[0]) ? badges[0] : undefined;

export function githubRepo(value) {
  if (typeof value !== 'string' || !/^https:\/\/github\.com\/[a-z\d-]{1,39}\/[\w.-]{1,100}\/?$/i.test(value)) throw invalid();
  const repo = value.slice('https://github.com/'.length).replace(/\/$/, '').replace(/\.git$/i, '').toLowerCase();
  if (['.', '..', ''].includes(repo.split('/')[1])) throw invalid();
  return repo;
}

export function createGithub({ fetchRemote = globalThis.fetch, run = promisify(execFile), now = Date.now, env = process.env, probeFlakeCli } = {}) {
  const token = async () => {
    if (env.GITHUB_TOKEN?.trim()) return env.GITHUB_TOKEN.trim();
    try { return (await run('gh', ['auth', 'token', '--hostname', 'github.com'], { timeout: 10000, maxBuffer: 8192 })).stdout.trim(); }
    catch { return ''; }
  };
  async function request(endpoint, credential, optional = false) {
    try {
      const url = new URL(endpoint, 'https://api.github.com');
      if (url.origin !== 'https://api.github.com') throw invalid();
      const response = await fetchRemote(url.href, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'DotCode', ...(credential ? { authorization: `Bearer ${credential}` } : {}) },
        redirect: 'error', signal: AbortSignal.timeout(15000),
      });
      if (optional && response.status === 404) return null;
      if (!response.ok) throw Object.assign(new Error(isRateLimit(response.status)
        ? rateLimitWarning
        : response.status === 401 ? 'GitHub token was rejected. Update GITHUB_TOKEN or run gh auth login.'
        : response.status === 404 ? 'GitHub repository was not found or is inaccessible.'
        : `GitHub request failed (HTTP ${response.status}).`), { code: 'SOURCE_ERROR', status: response.status });
      return await response.json();
    } catch (error) {
      if (error.code === 'SOURCE_ERROR' || error.code === 'INVALID_INPUT') throw error;
      throw Object.assign(new Error('Could not read GitHub. Check your connection and retry.'), { code: 'SOURCE_ERROR' });
    }
  }
  async function repository(repo, credential, ref) {
    const revision = await request(`/repos/${repo}/commits/${encodeURIComponent(ref)}`, credential);
    if (!/^[\da-f]{40}$/.test(revision?.sha)) throw new Error('GitHub returned an invalid commit.');
    const tree = await request(`/repos/${repo}/git/trees/${revision.sha}?recursive=1`, credential);
    if (!Array.isArray(tree?.tree) || tree.truncated) throw new Error('Cannot detect from an incomplete GitHub tree.');
    return { version: revision.sha, tree: tree.tree };
  }
  async function detectRepo(repo, credential, topics, ref = 'HEAD', onRateLimit) {
    const warnings = [];
    const probe = (promise, label) => promise.catch(error => {
      warnings.push(`Could not verify ${label}.`);
      if (isRateLimit(error.status)) {
        if (!warnings.includes(rateLimitWarning)) warnings.push(rateLimitWarning);
        onRateLimit?.();
      }
    });
    const [{ version, tree }, release, detectedTopics] = await Promise.all([
      repository(repo, credential, ref),
      ref === 'HEAD' ? probe(request(`/repos/${repo}/releases/latest`, credential, true), releaseLabel) : null,
      topics ?? probe(request(`/repos/${repo}`, credential).then(repoTopics), 'GitHub repository topics'),
    ]);
    const files = tree.filter(entry => entry.type === 'blob' && ['100644', '100755'].includes(entry.mode));
    const paths = new Set(files.map(entry => entry.path));
    const text = async file => {
      const data = await request(`/repos/${repo}/contents/${file}?ref=${version}`, credential);
      if (typeof data?.content !== 'string') throw new Error(`GitHub returned an invalid ${file}.`);
      return Buffer.from(data.content, 'base64').toString('utf8');
    };
    const manifest = async file => {
      const contents = await text(file);
      try {
        const value = JSON.parse(contents);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        return value;
      }
      catch { throw new Error(`GitHub returned an invalid ${file}.`); }
    };
    const skillPaths = [...paths].filter(file => /(^|\/)(SKILL|skill)\.md$/.test(file)).map(file => file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '');
    const badges = [];
    if (skillPaths.length) badges.push('Skill');
    const flakeCli = paths.has('flake.nix') && await probe(probeFlakeCli(repo, version), 'a default package in the repository flake');
    if (flakeCli === true) badges.push('Nix flake');
    if (Array.isArray(release?.assets) && release.assets.some(asset => /\.appimage$/i.test(asset?.name))) badges.push('AppImage');
    if (detectedTopics?.some(topic => ['mcp', 'mcp-server', 'model-context-protocol'].includes(topic))) badges.push('MCP');
    const webApp = paths.has('index.html') || paths.has('public/index.html');
    const plugin = [...paths].some(file => /^\.(?:claude|codex)-plugin\/(?:plugin|marketplace)\.json$/.test(file));
    let library = false, npmApp = false;
    const pkg = paths.has('package.json') ? await probe(manifest('package.json'), 'package.json') : null;
    if (pkg) {
      const bins = pkg.bin && typeof pkg.bin === 'object' && !Array.isArray(pkg.bin) ? Object.values(pkg.bin) : [pkg.bin];
      const binDirectory = typeof pkg.directories?.bin === 'string' ? npmBinPath(pkg.directories.bin).replace(/\/+$/, '') : '';
      const binPaths = new Set(bins.filter(nonempty).map(npmBinPath).filter(Boolean));
      const builds = ['build', 'prepare', 'prepack'].some(script => nonempty(pkg.scripts?.[script]));
      const generatedBin = [...binPaths].some(file => (builds || /^(lib|dist|build|out)\//.test(file)) && !tree.some(({ path }) => path === file));
      if (generatedBin || files.some(({ path, size }) => size !== 0 && (binPaths.has(path) || binDirectory && path.startsWith(`${binDirectory}/`)))) {
        badges.push('npm CLI');
      }
      npmApp = nonempty(pkg.scripts?.start) || paths.has('server.js') || webApp && nonempty(pkg.scripts?.dev);
      library = !npmApp && nonempty(pkg.name) && !pkg.private && !pkg.workspaces &&
        ([pkg.main, pkg.module, pkg.types, pkg.typings].some(nonempty) || hasExport(pkg.exports) || paths.has('index.js'));
      // A local entry can be a Node app entry or the entry of a public library.
      npmApp ||= !library && (paths.has('index.js') || nonempty(pkg.main) && paths.has(posix.normalize(pkg.main)));
      if (pkg.dependencies?.['@modelcontextprotocol/sdk'] && !badges.includes('MCP')) badges.push('MCP');
    }
    if (!badges.length && release !== undefined) {
      if (!plugin && !npmApp && paths.has('Cargo.toml')) {
        library = paths.has('src/lib.rs') && cargoLibrary(paths, await probe(text('Cargo.toml'), 'Cargo.toml') ?? '');
      }
      if (!plugin && !npmApp && !paths.has('Cargo.toml') && paths.has('pyproject.toml')) {
        library = Boolean(pythonLibrary(paths, await probe(text('pyproject.toml'), 'pyproject.toml') ?? ''));
      }
      let hook = false;
      if (flakeCli !== 'candidate' && pkg !== undefined && !plugin && !library && !npmApp && [...paths].every(file => hookRepoFile.test(file))) {
        hook = files.some(({ path, mode }) => mode === '100755' && gitHookNames.has(gitHook.exec(path)?.[1]));
        for (const file of ['.codex/hooks.json', '.claude/settings.json', 'hooks/hooks.json']) {
          if (!hook && paths.has(file)) hook = hasHook(await probe(manifest(file), file), file.startsWith('.codex/'));
        }
      }
      if (hook) badges.push('Hook');
      else if (library && !plugin) badges.push('Library');
    }
    if (flakeCli === 'candidate' && !badges.includes('Library')) badges.push('Nix flake');
    const error = warnings.join(' ');
    // ponytail: badges describe repository signals; ranked Recipes belong to each Backend's follow-up issue.
    return { detection: { checkedAt: new Date(now()).toISOString(), commit: version, badges: badges.length ? badges : ['Unknown'], skillPaths, ...(error && { error }) }, latestReleaseAt: releaseDate(release), warnings };
  }
  async function inspectRepo(repo, credential, onRateLimit) {
    const metadata = await request(`/repos/${repo}`, credential);
    return card(metadata, credential, onRateLimit);
  }
  async function card(metadata, credential, onRateLimit) {
    const repo = githubRepo(`https://github.com/${metadata?.full_name}`);
    const topics = repoTopics(metadata);
    let result;
    try {
      const { detection, latestReleaseAt } = await detectRepo(repo, credential, topics, 'HEAD', onRateLimit);
      result = { detection, latestReleaseAt };
    }
    catch (error) {
      if ([401, 403, 429].includes(error.status)) throw error;
      const release = await request(`/repos/${repo}/releases/latest`, credential, true).catch(error => {
        if (isRateLimit(error.status)) onRateLimit?.();
      });
      result = { detection: { checkedAt: new Date(now()).toISOString(), commit: null, badges: ['Unknown'], skillPaths: [], error: error.message }, latestReleaseAt: releaseDate(release) };
    }
    const badges = result.detection.badges;
    const category = badges.includes('Skill') ? 'Skills' : badges.includes('MCP') ? 'MCP servers' : badges.includes('AppImage') ? 'Desktop apps' : badges.includes('npm CLI') || badges.includes('Nix flake') ? 'Developer tools' : badges.includes('Hook') ? 'Hooks' : badges.includes('Library') ? 'Libraries' : topics[0] || 'Other';
    return {
      id: repo.replace('/', '--'), name: repo.split('/')[1], repo, githubUrl: `https://github.com/${repo}`,
      category, categoryLabel: category, description: typeof metadata.description === 'string' ? metadata.description : '',
      tags: topics, primaryLanguage: metadata.language || 'Unknown', stars: metadata.stargazers_count ?? 0,
      ...(/^https:\/\/avatars\.githubusercontent\.com\//.test(metadata.owner?.avatar_url) && { iconUrl: metadata.owner.avatar_url }),
      defaultInstallCommand: '', customNotes: '', customCommand: '', ...result,
    };
  }
  return {
    repository: async (githubUrl, ref) => repository(githubRepo(githubUrl), await token(), ref),
    detect: async (githubUrl, topics, ref) => detectRepo(githubRepo(githubUrl), await token(), topics, ref),
    inspect: async githubUrl => inspectRepo(githubRepo(githubUrl), await token()),
    search: async query => {
      if (typeof query !== 'string' || !query.trim() || query.length > 256) throw Object.assign(new Error('Enter a search keyword or GitHub repository URL (up to 256 characters).'), { code: 'INVALID_INPUT' });
      query = query.trim();
      const shorthand = /^[a-z\d-]{1,39}\/[\w.-]{1,100}\/?$/i.test(query);
      const isUrl = /^[a-z][a-z\d+.-]*:\/|^https?:|^(?:www\.)?github\.|^git@|^\/\//i.test(query);
      const repo = shorthand ? githubRepo(`https://github.com/${query}`) : isUrl ? githubRepo(query) : null;
      const credential = await token();
      const warnings = new Set();
      if (!credential) warnings.add('No GitHub token found. Search and detection use limited anonymous requests. Set GITHUB_TOKEN or run gh auth login for higher limits.');
      const onRateLimit = () => warnings.add(rateLimitWarning);
      let results;
      if (repo) results = [await inspectRepo(repo, credential, onRateLimit)];
      else {
        const response = await request(`/search/repositories?q=${encodeURIComponent(query)}&per_page=5`, credential);
        if (!Array.isArray(response?.items)) throw new Error('GitHub returned invalid search results.');
        results = await Promise.all(response.items.slice(0, 5).map(metadata => card(metadata, credential, onRateLimit)));
      }
      return { results, warning: [...warnings].join(' ') };
    },
  };
}
