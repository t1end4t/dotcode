import React, { useState } from 'react';
import type { ManageableItem } from './data/items';

export type SkillReceipt = {
  id: string;
  name: string;
  kind: 'skill';
  recipe: { backend: 'files'; source: { githubUrl: string; subpath: string; ref: string } };
  version: string;
  storePath: string;
  status: 'enabled' | 'disabled' | 'conflict';
  error?: string;
  activations: Record<'codex' | 'claude', { path: string; enabled: boolean }>;
};

export function mergeInstallerReceipts(items: ManageableItem[], receipts: SkillReceipt[]): ManageableItem[] {
  const key = (url: string) => url.replace(/\/$/, '').replace(/\.git$/, '').toLowerCase();
  return items.map(item => {
    const installedSkills = receipts.filter(receipt => receipt.kind === 'skill' && key(receipt.recipe.source.githubUrl) === key(item.githubUrl));
    return { ...item, installedSkills, ...(installedSkills.length ? { installed: true, currentVersion: installedSkills[0].version.slice(0, 12), hasUpdate: false, updateStatus: undefined } : {}) };
  });
}

export function installationStatus(item: ManageableItem) {
  if (!item.installed) return 'Not installed';
  if (!item.installedSkills?.length) return 'Installed · Unmanaged';
  if (item.installedSkills.some(receipt => receipt.status === 'conflict')) return 'Installed · Conflict';
  return item.installedSkills.some(receipt => receipt.status === 'enabled') ? 'Installed · Enabled' : 'Installed · Disabled';
}

export async function executeInstallerAction(body: Record<string, unknown>) {
  const post = async (route: string, value: Record<string, unknown>) => {
    const response = await fetch(`/api/installer/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || 'Installer request failed.'), { code: data.code });
    return data;
  };
  const plan = await post('plan', body);
  return post('execute', { planId: plan.id });
}

export function SkillControls({ item, onChanged, onUnsupported }: { item: ManageableItem; onChanged: () => Promise<void>; onUnsupported: () => void }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const receipts = item.installedSkills ?? [];
  const apply = async (body: Record<string, unknown>) => {
    if (working) return;
    setWorking(true);
    setError('');
    try {
      await executeInstallerAction(body);
      await onChanged();
    } catch (failure) {
      if (failure instanceof Error && 'code' in failure && failure.code === 'NOT_SKILL' && !item.detection?.skillPaths.length && body.action === 'install') onUnsupported();
      else setError(failure instanceof Error ? failure.message : 'Installer request failed.');
    } finally { setWorking(false); }
  };
  return <div className="skill-controls flex flex-col gap-2" onClick={event => event.stopPropagation()} aria-busy={working}>
    {receipts.length ? receipts.map(receipt => <div key={receipt.id} className="flex flex-wrap items-center gap-2">
      <span className="text-xs">{receipt.name}</span>
      {(['codex', 'claude'] as const).map(agent => <button key={agent} type="button" role="switch"
        aria-label={`Enable ${receipt.name} for ${agent === 'codex' ? 'Codex' : 'Claude'}`} aria-checked={receipt.activations[agent].enabled}
        disabled={working} className="rt-button" onClick={() => void apply({ action: receipt.activations[agent].enabled ? 'disable' : 'enable', componentId: receipt.id, agent })}>
        {agent === 'codex' ? 'Codex' : 'Claude'}: {receipt.activations[agent].enabled ? 'On' : 'Off'}
      </button>)}
      <button type="button" disabled={working} className="rt-button" onClick={() => void apply({ action: 'uninstall', componentId: receipt.id })}>Uninstall</button>
      {receipt.error && <p role="alert" className="text-xs text-(--ctp-red)">{receipt.error}</p>}
    </div>) : item.installed
      // No Receipt: DotCode never runs old lifecycle scripts, so there is nothing to act on.
      ? <span className="text-xs" title="Installed without DotCode. Manage it with the tool that installed it.">Unmanaged · display only</span>
      : <button type="button" disabled={working} className="rt-button rt-primary" onClick={() => void apply({ action: 'install', githubUrl: item.githubUrl })}>{working ? 'Working…' : 'Install'}</button>}
    {error && <p role="alert" className="text-xs text-(--ctp-red)">{error}</p>}
  </div>;
}
