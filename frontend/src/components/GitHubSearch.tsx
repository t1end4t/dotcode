import React, { useEffect, useRef, useState } from 'react';
import { Github, Loader2, Search, Star } from 'lucide-react';
import type { ManageableItem } from '../data/items';
import { readApiJson } from '../useCatalog';

const repoKey = (url: string) => url.toLowerCase().replace(/\/$/, '').replace(/\.git$/, '');

export function GitHubResults({ results, items, adding, onAdd }: { results: ManageableItem[]; items: ManageableItem[]; adding: string; onAdd: (item: ManageableItem) => void }) {
  if (!results.length) return <div role="status" className="discovery-message"><Search size={25} /><h3>No repositories found</h3><p>Try another keyword or repository URL.</p></div>;
  return <div aria-label="GitHub results">
    {results.map(item => {
      const exists = items.some(card => repoKey(card.githubUrl) === repoKey(item.githubUrl));
      return <article key={item.githubUrl} className="discovery-result" aria-label={item.repo}>
        <span className="owner-avatar">{item.iconUrl ? <img src={item.iconUrl} width="32" height="32" alt="" /> : <Github size={26} />}</span>
        <div className="discovery-result-body">
          <h3><a href={item.githubUrl} target="_blank" rel="noreferrer">{item.repo}</a></h3>
          <p>{item.description || 'No description provided.'}</p>
          <div className="discovery-meta">
            <span><Star size={12} />{(item.stars ?? 0).toLocaleString('en-US')} stars</span><span>{item.primaryLanguage}</span>
            <span>Latest release: {item.latestReleaseAt ? <time dateTime={item.latestReleaseAt}>{item.latestReleaseAt.slice(0, 10)}</time> : 'No releases'}</span>
            {item.detection?.badges.map(badge => <span key={badge} className="kind-label" title="Detector suggestion">{badge}</span>)}
          </div>
          {item.detection?.error && <p className="discovery-detection-error">Detection unavailable: {item.detection.error}</p>}
        </div>
        <div className="discovery-result-controls"><button type="button" className={exists ? 'button library-badge' : 'button'} aria-label={exists ? `${item.repo} is in Library` : `Add ${item.repo} to Library`}
          disabled={exists || Boolean(adding)} onClick={() => onAdd(item)}>
          {exists ? 'In Library' : adding === item.githubUrl ? 'Adding…' : 'Add'}
        </button></div>
      </article>;
    })}
  </div>;
}

export function GitHubSearch({ items, onAdded }: { items: ManageableItem[]; onAdded: () => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ManageableItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setSearching(true); setResults(null); setError(''); setWarning('');
    try {
      const data = await readApiJson(await fetch(`/api/installer/search?q=${encodeURIComponent(query.trim())}`, { signal: request.signal }));
      if (!request.signal.aborted) { setResults(data.results); setWarning(data.warning); }
    } catch (failure) {
      if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : 'GitHub search failed.');
    } finally { if (!request.signal.aborted) setSearching(false); }
  };
  const add = async (item: ManageableItem) => {
    if (adding) return;
    setAdding(item.githubUrl); setError('');
    try {
      await readApiJson(await fetch('/api/catalog/cards', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ githubUrl: item.githubUrl }) }));
      await onAdded();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not add repository.'); }
    finally { setAdding(''); }
  };
  return <section aria-label="Add from GitHub" className="connected-discovery">
    <form onSubmit={event => void search(event)} className="discovery-search" aria-busy={searching}>
      <label className="discovery-query">
        <Search aria-hidden="true" size={17} />
        <input autoFocus type="search" aria-label="Search GitHub" maxLength={256} value={query} disabled={Boolean(adding)}
          onChange={event => { controller.current?.abort(); setQuery(event.target.value); setSearching(false); setResults(null); setError(''); setWarning(''); }}
          placeholder="Search GitHub: keyword or https://github.com/owner/repo" />
      </label>
      <button type="submit" className="button primary" disabled={!query.trim() || searching || Boolean(adding)}>{searching ? 'Searching…' : 'Search'}</button>
    </form>
    <p className="discovery-help">Search by keyword or GitHub URL. Adding a Card does not install it.</p>
    {warning && <p role="status" className="discovery-help">{warning}</p>}
    <div className="discovery-results" aria-busy={searching || Boolean(adding)}>
      {error && <div className="discovery-message search-error"><p role="alert">{error}</p></div>}
      {searching && <div role="status" className="discovery-message"><Loader2 size={24} className="spinner" /><p>Searching GitHub and detecting repository capabilities…</p></div>}
      {results ? <GitHubResults results={results} items={items} adding={adding} onAdd={item => void add(item)} /> : !error && !searching && <div className="discovery-message"><Github size={30} /><h3>What would you like to add?</h3><p>Try a name, a topic or a tool you already use.</p></div>}
    </div>
  </section>;
}
