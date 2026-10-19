import React from "react";
import {
  X,
  ArrowUpCircle,
  Download,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  GitCommit,
  Check,
} from "lucide-react";
import { ManageableItem } from "../data/items";

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ManageableItem[];
  onUpdateItem: (id: string) => void;
  onUpdateAll: () => void;
  onAskAi: (prompt: string) => void;
  isChecking: boolean;
  onCheckAgain: () => void;
  lastCheckedTime: string;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateItem,
  onUpdateAll,
  onAskAi,
  isChecking,
  onCheckAgain,
  lastCheckedTime,
}) => {
  if (!isOpen) return null;

  const updateableItems = items.filter((i) => i.hasUpdate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <ArrowUpCircle className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-100">Release & Update Center</h3>
                {updateableItems.length > 0 && (
                  <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/20 font-mono">
                    {updateableItems.length} Available
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Last checked: {lastCheckedTime} · Inspecting GitHub releases
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onCheckAgain}
              disabled={isChecking}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-950 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
              title="Refresh update check from GitHub"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? "animate-spin text-indigo-400" : ""}`} />
              <span>{isChecking ? "Checking..." : "Check Now"}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Action strip */}
        {updateableItems.length > 0 && (
          <div className="flex items-center justify-between px-6 py-2.5 bg-amber-500/5 border-b border-amber-500/10 text-xs">
            <span className="text-amber-300">
              {updateableItems.length} tool{updateableItems.length > 1 ? "s have" : " has"} newer releases available on GitHub.
            </span>
            <button
              onClick={onUpdateAll}
              className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1 text-xs font-medium text-white hover:bg-amber-500 transition-colors shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Update All ({updateableItems.length})</span>
            </button>
          </div>
        )}

        {/* Items List */}
        <div className="p-6 flex-1 overflow-y-auto space-y-3">
          {updateableItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 mb-3 border border-emerald-500/20">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-semibold text-slate-200">All tools are up to date</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Every installed and managed repository in your DotCode stack matches the latest upstream release.
              </p>
              <button
                onClick={onCheckAgain}
                className="mt-4 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Run Manual Update Check</span>
              </button>
            </div>
          ) : (
            updateableItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 hover:border-slate-700 transition-all flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-100">{item.name}</h4>
                      <span className="font-mono text-xs text-slate-400">
                        {item.currentVersion || "v1.0.0"} → <strong className="text-amber-400">{item.latestVersion || "v1.1.0"}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span className="font-mono">{item.repo}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.categoryLabel}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onUpdateItem(item.id)}
                      className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors shadow-sm"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Update</span>
                    </button>
                  </div>
                </div>

                {/* Release Notes Preview */}
                {item.releaseNotes && (
                  <div className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-300">
                    <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400 mb-1">
                      <GitCommit className="h-3 w-3 text-indigo-400" />
                      <span>What's new in {item.latestVersion}:</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed text-[11px]">{item.releaseNotes}</p>
                  </div>
                )}

                {/* Footer links */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <a
                    href={`${item.githubUrl}/releases`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-slate-400 hover:text-indigo-400 transition-colors"
                  >
                    <span>View GitHub Release Notes</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>

                  <button
                    onClick={() => {
                      onClose();
                      onAskAi(
                        `What are the major updates and breaking changes in ${item.name} (${item.repo}) ${item.latestVersion}? How does it affect my setup?`
                      );
                    }}
                    className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-[11px]"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Ask AI about changes</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-950/60">
          <span className="text-xs text-slate-500">
            {updateableItems.length > 0
              ? `${updateableItems.length} updates pending`
              : "Stack is current"}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
