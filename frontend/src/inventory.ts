import type { ManageableItem } from './data/items';

export type Installation = {
  name: string;
  githubUrl: string;
  installed: boolean;
  location: string;
  method: string;
  configurationNotes: string;
  version: string;
  installCommand: string;
  updateCommand: string;
  uninstallCommand: string;
  verificationCommand: string;
  verifiedAt: string;
};

export type CategoryAssignment = { githubUrl: string; category: string };

export type ReleaseCheck = { githubUrl: string; latestVersion?: string; releaseNotes?: string; checkedAt: string; error?: string };

export function applyReleaseCheck(item: ManageableItem, check: ReleaseCheck): ManageableItem {
  // ponytail: numeric stable versions only; add release-aware ordering when prereleases need comparison.
  const numericVersion = (version = '') => /^v?(\d+(?:\.\d+)*)(?:\+[\w.-]+)?$/.exec(version)?.[1].split('.').map(BigInt);
  const current = numericVersion(item.currentVersion);
  const latest = numericVersion(check.latestVersion);
  let comparison = 0;
  if (current && latest) {
    for (let index = 0; index < Math.max(current.length, latest.length); index++) {
      if ((latest[index] ?? 0n) === (current[index] ?? 0n)) continue;
      comparison = (latest[index] ?? 0n) > (current[index] ?? 0n) ? 1 : -1;
      break;
    }
  }
  const hasUpdate = !check.error && item.installed && !!current && !!latest && comparison > 0;
  return { ...item, latestVersion: check.latestVersion, lastChecked: check.checkedAt, hasUpdate,
    releaseNotes: check.releaseNotes || check.error,
    updateStatus: check.error || (!item.installed ? `Latest release: ${check.latestVersion}`
      : !current || !latest ? `Latest: ${check.latestVersion}; installed version needs manual comparison.`
      : hasUpdate ? `Update available: ${item.currentVersion} to ${check.latestVersion}`
      : comparison < 0 ? 'Installed version is newer than the latest stable release.' : 'Up to date.'),
  };
}

export function mergeInventory(items: ManageableItem[], installations: Installation[], categories: CategoryAssignment[] = [], checks: ReleaseCheck[] = []): ManageableItem[] {
  const key = (url: string) => url.replace(/\/$/, '').replace(/\.git$/, '').toLowerCase();
  const receipts = new Map(installations.map(receipt => [key(receipt.githubUrl), receipt]));
  const labels = new Map(categories.map(entry => [key(entry.githubUrl), entry.category]));
  const merged = items.map(item => {
    const receipt = receipts.get(key(item.githubUrl));
    return {
      ...item,
      category: labels.get(key(item.githubUrl)) ?? (['tool', 'app', 'course', 'resource'].includes(item.category) ? 'Uncategorized' : item.category),
      categoryLabel: labels.get(key(item.githubUrl)) ?? (['tool', 'app', 'course', 'resource'].includes(item.category) ? 'Uncategorized' : item.category),
      installed: receipt?.installed ?? false,
      currentVersion: receipt?.version || undefined,
      latestVersion: undefined,
      hasUpdate: false,
      releaseNotes: receipt ? `Verified ${receipt.verifiedAt}. Location: ${receipt.location}` : 'Not verified on this machine.',
      lastChecked: receipt?.verifiedAt,
      receipt,
    };
  });
  const releases = new Map(checks.map(check => [key(check.githubUrl), check]));
  return merged.map(item => {
    const check = releases.get(key(item.githubUrl));
    return check ? applyReleaseCheck(item, check) : { ...item, updateStatus: undefined };
  });
}
