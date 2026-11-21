import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const invalid = () => Object.assign(new Error('Use a GitHub repository URL such as https://github.com/owner/repo.'), { code: 'INVALID_INPUT' });

export function githubRepo(value) {
  if (typeof value !== 'string' || !/^https:\/\/github\.com\/[a-z\d-]{1,39}\/[\w.-]{1,100}\/?$/i.test(value)) throw invalid();
  const repo = value.slice('https://github.com/'.length).replace(/\/$/, '').replace(/\.git$/i, '').toLowerCase();
  if (['.', '..', ''].includes(repo.split('/')[1])) throw invalid();
  return repo;
}

export function createGithub({ fetchRemote = globalThis.fetch, run = promisify(execFile), now = Date.now, env = process.env } = {}) {
  const token = async () => {
    if (env.GITHUB_TOKEN?.trim()) return env.GITHUB_TOKEN.trim();
    try { return (await run('gh', ['auth', 'token'], { timeout: 10000, maxBuffer: 8192 })).stdout.trim(); }
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
      if (!response.ok) throw Object.assign(new Error([403, 429].includes(response.status)
        ? 'GitHub rate limit or access restriction. Wait and retry, or configure GITHUB_TOKEN.'
        : response.status === 401 ? 'GitHub token was rejected. Update GITHUB_TOKEN or run gh auth login.'
        : response.status === 404 ? 'GitHub repository was not found or is inaccessible.'
        : `GitHub request failed (HTTP ${response.status}).`), { code: 'SOURCE_ERROR', status: response.status });
      return await response.json();
    } catch (error) {
      if (error.code === 'SOURCE_ERROR' || error.code === 'INVALID_INPUT') throw error;
      throw Object.assign(new Error('Could not read GitHub. Check your connection and retry.'), { code: 'SOURCE_ERROR' });
    }
  }
  async function detectRepo(repo, credential, topics = []) {
    const revision = await request(`/repos/${repo}/commits/HEAD`, credential);
    if (!/^[\da-f]{40}$/.test(revision?.sha)) throw new Error('GitHub returned an invalid commit.');
    const [tree, release] = await Promise.all([
      request(`/repos/${repo}/git/trees/${revision.sha}?recursive=1`, credential),
      request(`/repos/${repo}/releases/latest`, credential, true),
    ]);
    if (!Array.isArray(tree?.tree) || tree.truncated) throw new Error('Cannot detect from an incomplete GitHub tree.');
    const paths = tree.tree.filter(entry => entry.type === 'blob' && ['100644', '100755'].includes(entry.mode)).map(entry => entry.path);
    const skillPaths = paths.filter(file => /(^|\/)(SKILL|skill)\.md$/.test(file)).map(file => file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '');
    const badges = [];
    if (skillPaths.length) badges.push('Skill');
    if (paths.includes('flake.nix')) badges.push('Nix flake');
    if ((release?.assets ?? []).some(asset => /\.appimage$/i.test(asset.name))) badges.push('AppImage');
    if (topics.some(topic => ['mcp', 'mcp-server', 'model-context-protocol'].includes(topic))) badges.push('MCP');
    if (paths.includes('package.json')) {
      const manifest = await request(`/repos/${repo}/contents/package.json?ref=${revision.sha}`, credential);
      try {
        const pkg = JSON.parse(Buffer.from(manifest.content, 'base64').toString('utf8'));
        if (pkg.bin) badges.push('npm CLI');
        if (pkg.dependencies?.['@modelcontextprotocol/sdk'] && !badges.includes('MCP')) badges.push('MCP');
      } catch { throw new Error('GitHub returned an invalid package.json.'); }
    }
    // ponytail: badges describe repository signals; ranked Recipes belong to each Backend's follow-up issue.
    return { detection: { checkedAt: new Date(now()).toISOString(), commit: revision.sha, badges: badges.length ? badges : ['Unknown'], skillPaths }, latestReleaseAt: release?.published_at ?? null };
  }
  async function inspectRepo(repo, credential) {
    const metadata = await request(`/repos/${repo}`, credential);
    return card(metadata, credential);
  }
  async function card(metadata, credential) {
    const repo = githubRepo(`https://github.com/${metadata?.full_name}`);
    const topics = Array.isArray(metadata.topics) ? metadata.topics.filter(topic => typeof topic === 'string').slice(0, 50) : [];
    let result;
    try { result = await detectRepo(repo, credential, topics); }
    catch (error) {
      if ([401, 403, 429].includes(error.status)) throw error;
      const release = await request(`/repos/${repo}/releases/latest`, credential, true);
      result = { detection: { checkedAt: new Date(now()).toISOString(), commit: null, badges: ['Unknown'], skillPaths: [], error: error.message }, latestReleaseAt: release?.published_at ?? null };
    }
    const badges = result.detection.badges;
    const category = badges.includes('Skill') ? 'Skills' : badges.includes('MCP') ? 'MCP servers' : badges.includes('AppImage') ? 'Desktop apps' : badges.includes('npm CLI') || badges.includes('Nix flake') ? 'Developer tools' : topics[0] || 'Other';
    return {
      id: repo.replace('/', '--'), name: repo.split('/')[1], repo, githubUrl: `https://github.com/${repo}`,
      category, categoryLabel: category, description: typeof metadata.description === 'string' ? metadata.description : '',
      tags: topics, primaryLanguage: metadata.language || 'Unknown', stars: metadata.stargazers_count ?? 0,
      defaultInstallCommand: '', customNotes: '', customCommand: '', ...result,
    };
  }
  return {
    request: async endpoint => request(endpoint, await token()),
    detect: async (githubUrl, topics) => detectRepo(githubRepo(githubUrl), await token(), topics),
    inspect: async githubUrl => inspectRepo(githubRepo(githubUrl), await token()),
    search: async query => {
      if (typeof query !== 'string' || !query.trim() || query.length > 256) throw Object.assign(new Error('Enter a search keyword or GitHub repository URL (up to 256 characters).'), { code: 'INVALID_INPUT' });
      query = query.trim();
      const shorthand = /^[a-z\d-]{1,39}\/[\w.-]{1,100}\/?$/i.test(query);
      const isUrl = /^[a-z][a-z\d+.-]*:\/|^https?:|^(?:www\.)?github\./i.test(query);
      const repo = shorthand ? githubRepo(`https://github.com/${query}`) : isUrl ? githubRepo(query) : null;
      const credential = await token();
      let results;
      if (repo) results = [await inspectRepo(repo, credential)];
      else {
        const response = await request(`/search/repositories?q=${encodeURIComponent(query)}&per_page=5`, credential);
        if (!Array.isArray(response?.items)) throw new Error('GitHub returned invalid search results.');
        results = await Promise.all(response.items.slice(0, 5).map(metadata => card(metadata, credential)));
      }
      return { results, warning: credential ? '' : 'No GitHub token found. Search and detection use limited anonymous requests. Set GITHUB_TOKEN or run gh auth login for higher limits.' };
    },
  };
}
