import React, { useState } from "react";
import { X, Plus, FolderPlus, GitBranch } from "lucide-react";
import { ManageableItem, ItemCategory } from "../data/items";

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (newItem: ManageableItem) => void;
}

export const AddItemModal: React.FC<AddItemModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  if (!isOpen) return null;

  const [name, setName] = useState("");
  const [repo, setRepo] = useState("");
  const [category, setCategory] = useState<ItemCategory>("tool");
  const [description, setDescription] = useState("");
  const [primaryLanguage, setPrimaryLanguage] = useState("TypeScript");
  const [defaultInstallCommand, setDefaultInstallCommand] = useState("");
  const [tagsStr, setTagsStr] = useState("");

  const handleRepoChange = (val: string) => {
    setRepo(val);
    // Auto-fill name if clean
    if (!name && val.includes("/")) {
      const parts = val.split("/");
      setName(parts[parts.length - 1] || "");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !repo) return;

    let cleanRepo = repo.trim();
    if (cleanRepo.startsWith("https://github.com/")) {
      cleanRepo = cleanRepo.replace("https://github.com/", "");
    }

    const newItem: ManageableItem = {
      id: `item-${Date.now()}`,
      name: name.trim(),
      repo: cleanRepo,
      githubUrl: `https://github.com/${cleanRepo}`,
      category,
      categoryLabel:
        category === "tool"
          ? "CLI & Developer Tool"
          : category === "app"
          ? "Desktop Application"
          : category === "course"
          ? "Course & Guide"
          : "Engine & Resource",
      description: description.trim() || `Developer resource imported from ${cleanRepo}`,
      tags: tagsStr
        ? tagsStr.split(",").map((t) => t.trim()).filter(Boolean)
        : [category.toUpperCase()],
      stars: "1.0k+",
      primaryLanguage: primaryLanguage.trim() || "Multi-language",
      defaultInstallCommand:
        defaultInstallCommand.trim() || `git clone https://github.com/${cleanRepo}.git`,
      installed: false,
      enabled: false,
      customNotes: "",
      customCommand: defaultInstallCommand.trim(),
    };

    onAdd(newItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
              <FolderPlus className="h-4 w-4" />
            </div>
            <h3 className="text-base font-semibold text-slate-100">Add New Resource / Tool</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
              <GitBranch className="h-3.5 w-3.5" />
              GitHub Repository or URL *
            </label>
            <input
              type="text"
              required
              value={repo}
              onChange={(e) => handleRepoChange(e.target.value)}
              placeholder="e.g., owner/repo or https://github.com/owner/repo"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Display Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., DiskTree"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ItemCategory)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="tool">CLI & Dev Tool</option>
                <option value="app">Desktop Application</option>
                <option value="course">Course & Knowledge Base</option>
                <option value="resource">Engine & Resource</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of what this tool does and why it's in your stack..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Language / Tech</label>
              <input
                type="text"
                value={primaryLanguage}
                onChange={(e) => setPrimaryLanguage(e.target.value)}
                placeholder="e.g. Rust, Go, Python"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Tags (comma separated)</label>
              <input
                type="text"
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                placeholder="CLI, Fast, Memory"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Install / Launch Command</label>
            <input
              type="text"
              value={defaultInstallCommand}
              onChange={(e) => setDefaultInstallCommand(e.target.value)}
              placeholder="e.g., cargo install disktree"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs font-mono text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
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
              <Plus className="h-3.5 w-3.5" />
              <span>Add to Stack</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
