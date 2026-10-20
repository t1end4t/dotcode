import React, { useState, useEffect } from "react";
import {
  X,
  ExternalLink,
  Terminal,
  FileText,
  Tag,
  Check,
  Sparkles,
  ArrowUpCircle,
  RefreshCw,
  CheckCircle2,
  Download,
} from "lucide-react";
import { ManageableItem } from "../data/items";

interface CustomConfigModalProps {
  item: ManageableItem | null;
  isOpen: boolean;
  onClose: () => void;
  onAskAi: (prompt: string) => void;
  onUpdateItem?: (id: string) => void;
}

export const CustomConfigModal: React.FC<CustomConfigModalProps> = ({
  item,
  isOpen,
  onClose,
  onAskAi,
  onUpdateItem,
}) => {
  if (!isOpen || !item) return null;

  const [installed, setInstalled] = useState(item.installed);
  const [isCheckingRelease] = useState(false);
  const [checkSuccessMsg, setCheckSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setInstalled(item.installed);
      setCheckSuccessMsg(null);
    }
  }, [item]);

  const handleManualCheck = () => {
    onAskAi(`Check ${item.githubUrl} against its recorded installation and upstream releases. Do not change anything.`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#11111b]/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl rounded-2xl border border-[var(--dc-rule)] bg-[var(--dc-surface)] text-[var(--dc-ink)] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--dc-rule)] bg-[var(--dc-paper)]/50">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-[var(--dc-ink)]">{item.name}</h3>
              <span className="text-xs text-[var(--dc-muted)] font-mono">({item.repo})</span>
            </div>
            <p className="text-xs text-[var(--dc-muted)] mt-0.5">{item.categoryLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 text-[var(--dc-muted)] hover:text-[var(--dc-ink)] hover:bg-[var(--dc-raised)] rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="p-3 rounded-xl bg-[var(--dc-paper)] border border-[var(--dc-rule)]">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-[var(--dc-ink)]">Installation State</span>
                <p className="text-[11px] text-[var(--dc-muted)]">Last verified by Codex</p>
              </div>
              <button
                type="button"
                disabled
                aria-label="Verified installation state"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  installed ? "bg-[var(--ctp-green)]" : "bg-[var(--ctp-surface1)]"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    installed ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Version & Update Check Card */}
          <div className="rounded-xl border border-[var(--dc-rule)] bg-[var(--dc-paper)] p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-[var(--dc-ink)] flex items-center gap-1.5">
                  <ArrowUpCircle className="h-3.5 w-3.5 text-[var(--dc-accent)]" />
                  Version & Update Status
                </span>
                <p className="text-[11px] text-[var(--dc-muted)] font-mono mt-0.5">
                  Current: <strong className="text-[var(--dc-ink)]">{item.currentVersion || "Unknown"}</strong> · Upstream:{" "}
                  <strong className={item.hasUpdate ? "text-[var(--ctp-peach)]" : "text-[var(--ctp-green)]"}>
                    {item.latestVersion || "Not checked"}
                  </strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleManualCheck}
                  disabled={isCheckingRelease}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--dc-rule)] bg-[var(--dc-surface)] text-[11px] font-medium text-[var(--dc-ink)] hover:bg-[var(--dc-raised)] transition-colors"
                >
                  <RefreshCw className={`h-3 w-3 ${isCheckingRelease ? "animate-spin text-[var(--dc-accent)]" : ""}`} />
                  <span>Check</span>
                </button>

                {item.hasUpdate && onUpdateItem && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateItem(item.id);
                      onClose();
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--ctp-peach)] text-[#11111b] text-[11px] font-medium transition-colors shadow-sm"
                  >
                    <Download className="h-3 w-3" />
                    <span>Update to {item.latestVersion}</span>
                  </button>
                )}
              </div>
            </div>

            {checkSuccessMsg && (
              <p className="text-[11px] text-[var(--dc-accent)] bg-[var(--dc-accent-soft)] px-2.5 py-1 rounded border border-[var(--dc-accent)]/20">
                {checkSuccessMsg}
              </p>
            )}

            {item.releaseNotes && (
              <div className="text-[11px] text-[var(--dc-muted)] bg-[var(--dc-surface)] p-2 rounded border border-[var(--dc-rule)]">
                <strong className="text-[var(--dc-ink)]">Latest Changelog:</strong> {item.releaseNotes}
              </div>
            )}
          </div>

          <section className="rounded-xl border border-[var(--dc-rule)] bg-[var(--dc-paper)] p-3 text-xs text-[var(--dc-muted)]" aria-label="Card metadata">
            <h4 className="mb-2 flex items-center gap-1.5 font-medium text-[var(--dc-ink)]"><Terminal className="h-3.5 w-3.5 text-[var(--dc-accent)]" />Command</h4>
            <code className="block whitespace-pre-wrap break-all text-[var(--dc-ink)]">{item.customCommand || item.defaultInstallCommand || "Not recorded"}</code>
            <p className="mt-2">Recorded install: <code className="text-[var(--dc-muted)]">{item.receipt?.installCommand || "Ask Codex to inspect the repository first."}</code></p>
          </section>

          {item.receipt && (
            <section className="rounded-xl border border-[var(--dc-rule)] bg-[var(--dc-paper)] p-3 text-xs text-[var(--dc-muted)]" aria-label="Installation receipt">
              <p className="break-all">Location: {item.receipt.location || "Unknown"}</p>
              <p>Method: {item.receipt.method || "Unknown"}</p>
              <p className="whitespace-pre-wrap break-words">Configuration changes: {item.receipt.configurationNotes || "None recorded"}</p>
              <p>Verified: {new Date(item.receipt.verifiedAt).toLocaleString()}</p>
              {(["updateCommand", "uninstallCommand", "verificationCommand"] as const).map(field => (
                <div key={field} className="mt-2">
                  <span>{field.replace("Command", "")}: </span>
                  <code className="whitespace-pre-wrap break-all text-[var(--dc-ink)]">{item.receipt?.[field] || "Unsupported / not established"}</code>
                </div>
              ))}
              <button type="button" className="mt-3 text-[var(--dc-accent)] underline" onClick={() => { onAskAi(`Inspect lifecycle support for ${item.githubUrl}. Explain install, update, and uninstall where supported.`); onClose(); }}>Inspect lifecycle with Codex</button>
            </section>
          )}

          <section className="space-y-3 rounded-xl border border-[var(--dc-rule)] bg-[var(--dc-paper)] p-3 text-xs" aria-label="Saved card notes and tags">
            <div><h4 className="mb-1 flex items-center gap-1.5 font-medium text-[var(--dc-ink)]"><FileText className="h-3.5 w-3.5 text-[var(--dc-accent)]" />Notes</h4>
              <p className="whitespace-pre-wrap break-words text-[var(--dc-muted)]">{item.customNotes || "None"}</p></div>
            <div><h4 className="mb-1 flex items-center gap-1.5 font-medium text-[var(--dc-ink)]"><Tag className="h-3.5 w-3.5 text-[var(--dc-accent)]" />Tags</h4>
              <p className="text-[var(--dc-muted)]">{item.tags.join(", ") || "None"}</p></div>
          </section>

          {/* External Link & Quick AI Help */}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--dc-rule)]">
            <a
              href={item.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-[var(--dc-accent)] hover:underline"
            >
              <span>View GitHub Repository</span>
              <ExternalLink className="h-3 w-3" />
            </a>

            <button
              type="button"
              onClick={() => {
                onClose();
                onAskAi(`How do I set up, configure and update ${item.name} (${item.repo}) for my daily workflow?`);
              }}
              className="flex items-center gap-1 rounded-lg bg-[var(--dc-accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--dc-accent)] border border-[var(--dc-accent)]/30 hover:bg-[var(--dc-accent-soft)]/80 transition-colors"
            >
              <Sparkles className="h-3 w-3" />
              <span>Ask AI about setup & updates</span>
            </button>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[var(--dc-rule)]">
            <button type="button" onClick={() => { onAskAi(`Update or remove the ${item.name} card (${item.githubUrl}): `); onClose(); }}
              className="rt-button text-[var(--dc-accent)]">Manage in chat</button>
            <button type="button" onClick={onClose} className="rt-button">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};
