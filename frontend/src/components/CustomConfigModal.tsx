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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-100">{item.name}</h3>
              <span className="text-xs text-slate-500 font-mono">({item.repo})</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{item.categoryLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-200">Installation State</span>
                <p className="text-[11px] text-slate-400">Last verified by Codex</p>
              </div>
              <button
                type="button"
                disabled
                aria-label="Verified installation state"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  installed ? "bg-emerald-600" : "bg-slate-700"
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
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <ArrowUpCircle className="h-3.5 w-3.5 text-indigo-400" />
                  Version & Update Status
                </span>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  Current: <strong className="text-slate-200">{item.currentVersion || "Unknown"}</strong> · Upstream:{" "}
                  <strong className={item.hasUpdate ? "text-amber-400" : "text-emerald-400"}>
                    {item.latestVersion || "Not checked"}
                  </strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleManualCheck}
                  disabled={isCheckingRelease}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 text-[11px] font-medium text-slate-300 hover:text-white transition-colors"
                >
                  <RefreshCw className={`h-3 w-3 ${isCheckingRelease ? "animate-spin text-indigo-400" : ""}`} />
                  <span>Check</span>
                </button>

                {item.hasUpdate && onUpdateItem && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateItem(item.id);
                      onClose();
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 text-[11px] font-medium text-white hover:bg-amber-500 transition-colors shadow-sm"
                  >
                    <Download className="h-3 w-3" />
                    <span>Update to {item.latestVersion}</span>
                  </button>
                )}
              </div>
            </div>

            {checkSuccessMsg && (
              <p className="text-[11px] text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded border border-indigo-500/20">
                {checkSuccessMsg}
              </p>
            )}

            {item.releaseNotes && (
              <div className="text-[11px] text-slate-400 bg-slate-900/80 p-2 rounded border border-slate-800">
                <strong className="text-slate-300">Latest Changelog:</strong> {item.releaseNotes}
              </div>
            )}
          </div>

          <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400" aria-label="Card metadata">
            <h4 className="mb-2 flex items-center gap-1.5 font-medium text-slate-300"><Terminal className="h-3.5 w-3.5 text-indigo-400" />Command</h4>
            <code className="block whitespace-pre-wrap break-all text-slate-300">{item.customCommand || item.defaultInstallCommand || "Not recorded"}</code>
            <p className="mt-2">Recorded install: <code className="text-slate-400">{item.receipt?.installCommand || "Ask Codex to inspect the repository first."}</code></p>
          </section>

          {item.receipt && (
            <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400" aria-label="Installation receipt">
              <p className="break-all">Location: {item.receipt.location || "Unknown"}</p>
              <p>Method: {item.receipt.method || "Unknown"}</p>
              <p className="whitespace-pre-wrap break-words">Configuration changes: {item.receipt.configurationNotes || "None recorded"}</p>
              <p>Verified: {new Date(item.receipt.verifiedAt).toLocaleString()}</p>
              {(["updateCommand", "uninstallCommand", "verificationCommand"] as const).map(field => (
                <div key={field} className="mt-2">
                  <span>{field.replace("Command", "")}: </span>
                  <code className="whitespace-pre-wrap break-all text-slate-300">{item.receipt?.[field] || "Unsupported / not established"}</code>
                </div>
              ))}
              <button type="button" className="mt-3 text-indigo-300 underline" onClick={() => { onAskAi(`Inspect lifecycle support for ${item.githubUrl}. Explain install, update, and uninstall where supported.`); onClose(); }}>Inspect lifecycle with Codex</button>
            </section>
          )}

          <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs" aria-label="Saved card notes and tags">
            <div><h4 className="mb-1 flex items-center gap-1.5 font-medium text-slate-300"><FileText className="h-3.5 w-3.5 text-indigo-400" />Notes</h4>
              <p className="whitespace-pre-wrap break-words text-slate-400">{item.customNotes || "None"}</p></div>
            <div><h4 className="mb-1 flex items-center gap-1.5 font-medium text-slate-300"><Tag className="h-3.5 w-3.5 text-indigo-400" />Tags</h4>
              <p className="text-slate-400">{item.tags.join(", ") || "None"}</p></div>
          </section>

          {/* External Link & Quick AI Help */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <a
              href={item.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 hover:underline"
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
              className="flex items-center gap-1 rounded-md bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/30 transition-colors"
            >
              <Sparkles className="h-3 w-3" />
              <span>Ask AI about setup & updates</span>
            </button>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button type="button" onClick={() => { onAskAi(`Update or remove the ${item.name} card (${item.githubUrl}): `); onClose(); }}
              className="rounded-lg px-3 py-2 text-xs font-medium text-indigo-300 hover:bg-indigo-500/10 focus-visible:ring-2 focus-visible:ring-indigo-400">Manage in chat</button>
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};
