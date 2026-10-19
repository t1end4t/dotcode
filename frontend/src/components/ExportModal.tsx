import React, { useState } from "react";
import { X, Copy, Check, Terminal, FileCode, FileText } from "lucide-react";
import { ManageableItem } from "../data/items";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ManageableItem[];
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, items }) => {
  if (!isOpen) return null;

  const [tab, setTab] = useState<"bash" | "json" | "markdown">("bash");
  const [copied, setCopied] = useState(false);

  const enabledItems = items.filter((i) => i.enabled);

  const generateBash = () => {
    const lines = [
      "#!/usr/bin/env bash",
      "# DotCode Setup Script - Generated from Tool & Resource Manager",
      "set -e",
      "",
      `echo "🚀 Installing ${enabledItems.length} enabled DotCode tools & resources..."`,
      "",
    ];

    enabledItems.forEach((item) => {
      const cmd = item.customCommand || item.defaultInstallCommand;
      if (cmd) {
        lines.push(`echo "==> Setting up ${item.name} (${item.repo})..."`);
        lines.push(cmd);
        lines.push("");
      }
    });

    lines.push('echo "✅ All DotCode tools installed and configured successfully!"');
    return lines.join("\n");
  };

  const generateJson = () => {
    return JSON.stringify(items, null, 2);
  };

  const generateMarkdown = () => {
    const lines = [
      "# DotCode Stack & Reading Checklist",
      "",
      `Generated on ${new Date().toLocaleDateString()} · ${items.length} items (${enabledItems.length} enabled, ${items.filter(i => i.installed).length} installed)`,
      "",
      "## Enabled & Active Stack",
      "",
    ];

    enabledItems.forEach((item) => {
      lines.push(
        `- [${item.installed ? "x" : " "}] **[${item.name}](${item.githubUrl})** (\`${item.categoryLabel}\`) - ${item.description}`
      );
      if (item.customCommand) {
        lines.push(`  - Command: \`${item.customCommand}\``);
      }
      if (item.customNotes) {
        lines.push(`  - Notes: ${item.customNotes}`);
      }
    });

    lines.push("");
    lines.push("## Available Catalog");
    lines.push("");

    items
      .filter((i) => !i.enabled)
      .forEach((item) => {
        lines.push(
          `- [ ] **[${item.name}](${item.githubUrl})** (\`${item.categoryLabel}\`) - ${item.description}`
        );
      });

    return lines.join("\n");
  };

  const content =
    tab === "bash"
      ? generateBash()
      : tab === "json"
      ? generateJson()
      : generateMarkdown();

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div>
            <h3 className="text-base font-semibold text-slate-100">Export & Script Generator</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Export your configured dotcode setup as a runnable script or document
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Format Selector Tabs */}
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-slate-800 bg-slate-950/30">
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-950 border border-slate-800">
            <button
              onClick={() => setTab("bash")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === "bash"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Bash Script ({enabledItems.length})</span>
            </button>
            <button
              onClick={() => setTab("markdown")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === "markdown"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Markdown Checklist</span>
            </button>
            <button
              onClick={() => setTab("json")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === "json"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileCode className="h-3.5 w-3.5" />
              <span>JSON State</span>
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors border border-slate-700"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Content</span>
              </>
            )}
          </button>
        </div>

        {/* Code Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 text-xs font-mono text-slate-200 overflow-x-auto whitespace-pre leading-relaxed">
            {content}
          </pre>
        </div>

        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-950/50">
          <span className="text-xs text-slate-500">
            {tab === "bash" ? "Run with bash setup.sh" : tab === "markdown" ? "Save as STACK.md" : "Ready for import"}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
