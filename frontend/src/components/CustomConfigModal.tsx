import React, { useState, useEffect } from "react";
import {
  X,
  Save,
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
  Trash2,
} from "lucide-react";
import { ManageableItem } from "../data/items";

interface CustomConfigModalProps {
  item: ManageableItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedItem: ManageableItem) => void;
  onAskAi: (prompt: string) => void;
  onUpdateItem?: (id: string) => void;
  onRemoveItem?: (id: string) => void;
}

export const CustomConfigModal: React.FC<CustomConfigModalProps> = ({
  item,
  isOpen,
  onClose,
  onSave,
  onAskAi,
  onUpdateItem,
  onRemoveItem,
}) => {
  if (!isOpen || !item) return null;

  const [customCommand, setCustomCommand] = useState(item.customCommand || item.defaultInstallCommand);
  const [customNotes, setCustomNotes] = useState(item.customNotes || "");
  const [enabled, setEnabled] = useState(item.enabled);
  const [installed, setInstalled] = useState(item.installed);
  const [tagsStr, setTagsStr] = useState(item.tags.join(", "));
  const [isCheckingRelease, setIsCheckingRelease] = useState(false);
  const [checkSuccessMsg, setCheckSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setCustomCommand(item.customCommand || item.defaultInstallCommand);
      setCustomNotes(item.customNotes || "");
      setEnabled(item.enabled);
      setInstalled(item.installed);
      setTagsStr(item.tags.join(", "));
      setCheckSuccessMsg(null);
    }
  }, [item]);

  const handleManualCheck = () => {
    setIsCheckingRelease(true);
    setTimeout(() => {
      setIsCheckingRelease(false);
      setCheckSuccessMsg(
        item.hasUpdate
          ? `Newer release ${item.latestVersion} found on GitHub!`
          : `Up to date: ${item.currentVersion || "v1.0.0"} is the latest release.`
      );
    }, 700);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: ManageableItem = {
      ...item,
      customCommand,
      customNotes,
      enabled,
      installed,
      tags: tagsStr.split(",").map((t) => t.trim()).filter(Boolean),
    };
    onSave(updated);
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Quick status toggles */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-200">Installation State</span>
                <p className="text-[11px] text-slate-400">Mark as installed in local env</p>
              </div>
              <button
                type="button"
                onClick={() => setInstalled(!installed)}
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

            <div className="flex items-center justify-between border-l border-slate-800/80 pl-3">
              <div>
                <span className="text-xs font-medium text-slate-200">Active / Enabled</span>
                <p className="text-[11px] text-slate-400">Include in runtime config</p>
              </div>
              <button
                type="button"
                onClick={() => setEnabled(!enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  enabled ? "bg-indigo-600" : "bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabled ? "translate-x-6" : "translate-x-1"
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
                  Current: <strong className="text-slate-200">{item.currentVersion || "v1.0.0"}</strong> · Upstream:{" "}
                  <strong className={item.hasUpdate ? "text-amber-400" : "text-emerald-400"}>
                    {item.latestVersion || "v1.0.0"}
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

          {/* Custom Launch / Execution Command */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-indigo-400" />
                Custom Run / Install Command
              </span>
              <span className="text-[11px] text-slate-500 font-mono">Bash command</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
                placeholder="e.g., cargo install disktree, or python run.py"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Default: <code className="text-slate-400">{item.defaultInstallCommand}</code>
            </p>
          </div>

          {/* Custom Notes & Cheatsheet */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-indigo-400" />
              Personal Notes, Keybindings & Cheatsheet
            </label>
            <textarea
              rows={3}
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder="Add personal flags, tips, API tokens or reasons you use this tool..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-indigo-400" />
              Tags (comma separated)
            </label>
            <input
              type="text"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="CLI, Rust, Performance, Productivity"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

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

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            {onRemoveItem && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Remove "${item.name}" from your DotCode stack?`)) {
                    onRemoveItem(item.id);
                    onClose();
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors border border-rose-500/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Remove Card</span>
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 transition-colors shadow-sm"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Save Configuration</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
