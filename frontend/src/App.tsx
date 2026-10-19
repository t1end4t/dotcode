import React, { useState, useMemo, useEffect } from "react";
import {
  Search,
  SlidersHorizontal,
  Sparkles,
  Plus,
  Download,
  Trash2,
  Power,
  Edit3,
  ExternalLink,
  Terminal,
  BookOpen,
  LayoutGrid,
  List,
  CheckCircle2,
  FolderSync,
  Layers,
  Wrench,
  Monitor,
  Library,
  BookMarked,
  Cpu,
  RefreshCw,
  ArrowUpCircle,
  GitCommit,
  Check,
} from "lucide-react";
import { INITIAL_ITEMS, ManageableItem, ItemCategory, UPDATE_REGISTRY } from "./data/items";
import { AiPane } from "./components/AiPane";
import { CustomConfigModal } from "./components/CustomConfigModal";
import { AddItemModal } from "./components/AddItemModal";
import { ExportModal } from "./components/ExportModal";
import { UpdateModal } from "./components/UpdateModal";

export default function App() {
  const [items, setItems] = useState<ManageableItem[]>(() => {
    const saved = localStorage.getItem("dotcode_items");
    if (saved) {
      try {
        const parsed: ManageableItem[] = JSON.parse(saved);
        // Ensure version fields exist from registry if imported from earlier session
        return parsed.map((item) => {
          const reg = UPDATE_REGISTRY[item.id];
          return {
            ...item,
            currentVersion: item.currentVersion || reg?.current || "v1.0.0",
            latestVersion: item.latestVersion || reg?.latest || "v1.0.0",
            hasUpdate: item.hasUpdate !== undefined ? item.hasUpdate : (reg?.hasUpdate || false),
            releaseNotes: item.releaseNotes || reg?.notes || "Up to date with upstream",
            lastChecked: item.lastChecked || "Today, 4:05 AM",
          };
        });
      } catch (e) {
        console.error("Failed to parse saved items:", e);
      }
    }
    return INITIAL_ITEMS;
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ItemCategory | "all">("all");
  const [selectedStatus, setSelectedStatus] = useState<
    "all" | "installed" | "enabled" | "disabled" | "updates" | "available"
  >("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [isAiPaneOpen, setIsAiPaneOpen] = useState(true);
  const [prefilledAiPrompt, setPrefilledAiPrompt] = useState<string | undefined>();
  const [editingItem, setEditingItem] = useState<ManageableItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [lastCheckedTime, setLastCheckedTime] = useState("Today, 4:05 AM");
  const [backendHealth, setBackendHealth] = useState<{ ok: boolean; hasAiKey: boolean } | null>(null);

  // Sync items to localStorage
  useEffect(() => {
    localStorage.setItem("dotcode_items", JSON.stringify(items));
  }, [items]);

  // Check backend health
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => setBackendHealth({ ok: data.ok, hasAiKey: data.hasAiKey }))
      .catch(() => setBackendHealth({ ok: false, hasAiKey: false }));
  }, []);

  // Filter & Search Logic
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Category filter
      if (selectedCategory !== "all" && item.category !== selectedCategory) {
        return false;
      }

      // Status filter
      if (selectedStatus === "installed" && !item.installed) return false;
      if (selectedStatus === "enabled" && !item.enabled) return false;
      if (selectedStatus === "disabled" && item.enabled) return false;
      if (selectedStatus === "available" && item.installed) return false;
      if (selectedStatus === "updates" && !item.hasUpdate) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesRepo = item.repo.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        const matchesLang = item.primaryLanguage.toLowerCase().includes(q);
        const matchesTags = item.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchesName && !matchesRepo && !matchesDesc && !matchesLang && !matchesTags) {
          return false;
        }
      }

      return true;
    });
  }, [items, selectedCategory, selectedStatus, searchQuery]);

  // Status metrics
  const totalCount = items.length;
  const installedCount = items.filter((i) => i.installed).length;
  const enabledCount = items.filter((i) => i.enabled).length;
  const updatesCount = items.filter((i) => i.hasUpdate).length;

  // Global Check for Updates action
  const handleCheckUpdates = () => {
    setIsCheckingUpdates(true);
    setTimeout(() => {
      setIsCheckingUpdates(false);
      const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setLastCheckedTime(`Today, ${nowStr}`);
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          lastChecked: `Today, ${nowStr}`,
        }))
      );
      setIsUpdateModalOpen(true);
    }, 850);
  };

  // Update a single item
  const handleUpdateItem = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            currentVersion: item.latestVersion || item.currentVersion,
            hasUpdate: false,
            installed: true,
          };
        }
        return item;
      })
    );
  };

  // Update all items that have updates available
  const handleUpdateAll = () => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.hasUpdate) {
          return {
            ...item,
            currentVersion: item.latestVersion || item.currentVersion,
            hasUpdate: false,
            installed: true,
          };
        }
        return item;
      })
    );
  };

  // Toggle Install
  const handleToggleInstall = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nextInstalled = !item.installed;
          return {
            ...item,
            installed: nextInstalled,
            enabled: nextInstalled ? true : false,
          };
        }
        return item;
      })
    );
  };

  // Toggle Enable
  const handleToggleEnable = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            enabled: !item.enabled,
          };
        }
        return item;
      })
    );
  };

  // Update item from config modal
  const handleSaveItem = (updated: ManageableItem) => {
    setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  };

  // Add new item
  const handleAddItem = (newItem: ManageableItem) => {
    setItems((prev) => [newItem, ...prev]);
  };

  // Remove card / item from collection
  const handleRemoveItem = (id: string, name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (confirm(`Remove "${name}" card from your DotCode collection?`)) {
      setItems((prev) => prev.filter((item) => item.id !== id));
      if (editingItem?.id === id) {
        setEditingItem(null);
      }
    }
  };

  // Batch actions
  const handleEnableAll = () => {
    setItems((prev) => prev.map((i) => ({ ...i, enabled: true })));
  };

  const handleDisableAll = () => {
    setItems((prev) => prev.map((i) => ({ ...i, enabled: false })));
  };

  const handleResetDefaults = () => {
    if (confirm("Reset all 39 DotCode tools and resources to template defaults?")) {
      setItems(INITIAL_ITEMS);
    }
  };

  const handleAskAiAboutItem = (item: ManageableItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsAiPaneOpen(true);
    setPrefilledAiPrompt(
      `Tell me how to use and customize ${item.name} (${item.repo}) for my daily workflow. What are the best command flags or configuration patterns?`
    );
  };

  const categoryIcons: Record<ItemCategory, React.ElementType> = {
    tool: Wrench,
    app: Monitor,
    course: BookOpen,
    resource: Cpu,
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
      {/* Main Content Area */}
      <div className={`flex flex-1 flex-col overflow-hidden transition-all duration-200 ${isAiPaneOpen ? "lg:mr-[460px]" : ""}`}>
        {/* Top Navbar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-900/60 px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-md shadow-indigo-500/20 text-white font-bold text-sm tracking-wider">
              DC
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight text-slate-100">DotCode Hub</h1>
                <span className="text-[11px] text-slate-500 font-mono">v1.2</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Curated Developer Tools, Desktop Apps & Engineering Resources
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="hidden sm:flex items-center relative w-64 lg:w-80">
            <Search className="absolute left-3 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 39 tools, apps, courses, tags..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-9 pr-8 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 text-xs text-slate-500 hover:text-slate-300"
              >
                ✕
              </button>
            )}
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-2">
            {/* Check for Updates Button */}
            <button
              onClick={handleCheckUpdates}
              disabled={isCheckingUpdates}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                updatesCount > 0
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                  : "border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
              title="Check all 39 repositories for newer releases"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isCheckingUpdates ? "animate-spin text-indigo-400" : ""}`} />
              <span className="hidden sm:inline">{isCheckingUpdates ? "Checking..." : "Check Updates"}</span>
              {updatesCount > 0 && (
                <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-bold text-slate-950 font-mono">
                  {updatesCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <Plus className="h-3.5 w-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Add Item</span>
            </button>

            <button
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
              title="Export bash setup script or markdown"
            >
              <Download className="h-3.5 w-3.5 text-slate-400" />
              <span className="hidden md:inline">Export Script</span>
            </button>

            {/* AI Pane Toggle Button */}
            <button
              onClick={() => setIsAiPaneOpen(!isAiPaneOpen)}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all shadow-sm ${
                isAiPaneOpen
                  ? "bg-indigo-600 text-white shadow-indigo-500/20"
                  : "border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{isAiPaneOpen ? "Close Copilot" : "AI Copilot"}</span>
              <span className="hidden md:inline text-[10px] bg-black/20 px-1 rounded font-mono">
                Gemini
              </span>
            </button>
          </div>
        </header>

        {/* Filter and Metrics Toolbar */}
        <div className="border-b border-slate-800/80 bg-slate-950/40 px-6 py-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Category tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              {[
                { id: "all", label: "All Items", count: items.length },
                { id: "tool", label: "CLI & Tools", count: items.filter((i) => i.category === "tool").length },
                { id: "app", label: "Desktop Apps", count: items.filter((i) => i.category === "app").length },
                { id: "course", label: "Courses & Books", count: items.filter((i) => i.category === "course").length },
                { id: "resource", label: "Engines & RAG", count: items.filter((i) => i.category === "resource").length },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedCategory(tab.id as any)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                    selectedCategory === tab.id
                      ? "bg-slate-800 text-white border border-slate-700 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="text-[10px] text-slate-500 font-mono">({tab.count})</span>
                </button>
              ))}
            </div>

            {/* Lifecycle Status & View Switcher */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-slate-800 text-xs overflow-x-auto">
                {[
                  { id: "all", label: "All" },
                  { id: "installed", label: `Installed (${installedCount})` },
                  { id: "enabled", label: `Enabled (${enabledCount})` },
                  { id: "updates", label: `Updates (${updatesCount})` },
                  { id: "available", label: "Available" },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStatus(s.id as any)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
                      selectedStatus === s.id
                        ? s.id === "updates" && updatesCount > 0
                          ? "bg-amber-600 text-white shadow-sm"
                          : "bg-slate-800 text-slate-100 shadow-sm"
                        : s.id === "updates" && updatesCount > 0
                        ? "text-amber-400 hover:text-amber-300 font-semibold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* View toggle */}
              <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900 p-0.5">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1 rounded ${viewMode === "grid" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
                  title="Grid view"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  className={`p-1 rounded ${viewMode === "table" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}
                  title="Dense list view"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Stats Bar & Batch Tools */}
          <div className="mt-2.5 pt-2 border-t border-slate-800/50 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
            <div className="flex items-center gap-3">
              <span>
                Showing <strong className="text-slate-200">{filteredItems.length}</strong> of {totalCount} items
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {installedCount} installed
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-indigo-400 flex items-center gap-1">
                <Power className="h-3 w-3" />
                {enabledCount} active
              </span>
              {updatesCount > 0 && (
                <>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <button
                    onClick={() => setIsUpdateModalOpen(true)}
                    className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium hover:underline"
                  >
                    <ArrowUpCircle className="h-3 w-3" />
                    {updatesCount} updates available
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {updatesCount > 0 && (
                <>
                  <button
                    onClick={handleUpdateAll}
                    className="text-[11px] font-medium text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1"
                  >
                    <Download className="h-3 w-3" />
                    Update All ({updatesCount})
                  </button>
                  <span aria-hidden="true" className="text-slate-700">|</span>
                </>
              )}
              <button
                onClick={handleEnableAll}
                className="text-[11px] text-slate-400 hover:text-indigo-300 hover:underline"
              >
                Enable All
              </button>
              <span aria-hidden="true" className="text-slate-700">|</span>
              <button
                onClick={handleDisableAll}
                className="text-[11px] text-slate-400 hover:text-slate-200 hover:underline"
              >
                Disable All
              </button>
              <span aria-hidden="true" className="text-slate-700">|</span>
              <button
                onClick={handleResetDefaults}
                className="text-[11px] text-slate-500 hover:text-rose-400 hover:underline flex items-center gap-1"
              >
                <RefreshCw className="h-2.5 w-2.5" />
                Reset Defaults
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Items Container */}
        <main className="flex-1 overflow-y-auto p-6">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center rounded-2xl border border-dashed border-slate-800 p-8">
              <Search className="h-8 w-8 text-slate-600 mb-3" />
              <h3 className="text-sm font-semibold text-slate-200">No items match your filter</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Try clearing your search query or switching categories to see all 39 imported tools and resources.
              </p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("all");
                  setSelectedStatus("all");
                }}
                className="mt-4 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
              >
                Reset All Filters
              </button>
            </div>
          ) : viewMode === "grid" ? (
            /* Card Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredItems.map((item) => {
                const IconComponent = categoryIcons[item.category] || Wrench;
                return (
                  <div
                    key={item.id}
                    onClick={() => setEditingItem(item)}
                    className={`group relative flex flex-col justify-between rounded-xl border p-4 transition-all cursor-pointer ${
                      item.enabled
                        ? "border-slate-700/80 bg-slate-900/90 hover:border-indigo-500/60 hover:shadow-lg hover:shadow-indigo-500/5"
                        : "border-slate-800/80 bg-slate-900/40 opacity-75 hover:opacity-100 hover:border-slate-700"
                    }`}
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`p-2 rounded-lg ${
                            item.category === "tool"
                              ? "bg-amber-500/10 text-amber-400"
                              : item.category === "app"
                              ? "bg-cyan-500/10 text-cyan-400"
                              : item.category === "course"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-indigo-500/10 text-indigo-400"
                          }`}>
                            <IconComponent className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h3 className="text-sm font-semibold text-slate-100 group-hover:text-indigo-300 transition-colors">
                                {item.name}
                              </h3>
                              {item.hasUpdate && (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsUpdateModalOpen(true);
                                  }}
                                  className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded hover:bg-amber-500/20 transition-colors"
                                  title={`Update available: ${item.currentVersion} → ${item.latestVersion}`}
                                >
                                  Update Available
                                </span>
                              )}
                            </div>
                            <a
                              href={item.githubUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 font-mono"
                            >
                              <span>{item.repo}</span>
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          </div>
                        </div>

                        {/* Enable/Disable Switch */}
                        <div
                          className="flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => handleToggleEnable(item.id, e)}
                            title={item.enabled ? "Enabled in stack (Click to disable)" : "Disabled (Click to enable)"}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                              item.enabled ? "bg-indigo-600" : "bg-slate-700"
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out mt-[3px] ${
                                item.enabled ? "translate-x-4.5" : "translate-x-0.5"
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Unboxed Metadata (Zero-pill discipline per frontend-design) */}
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 my-2">
                        <span>{item.categoryLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.primaryLanguage}</span>
                        <span aria-hidden="true">·</span>
                        <span>★ {item.stars}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-slate-400">
                          {item.currentVersion || "v1.0.0"}
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-slate-300 leading-relaxed line-clamp-2 mb-3">
                        {item.description}
                      </p>

                      {/* Custom Command or Notes Preview */}
                      {(item.customCommand || item.defaultInstallCommand) && (
                        <div className="mb-3 rounded-lg bg-slate-950/70 border border-slate-800/80 px-2.5 py-1.5 font-mono text-[11px] text-slate-400 truncate flex items-center gap-1.5">
                          <Terminal className="h-3 w-3 text-slate-500 shrink-0" />
                          <span className="truncate">{item.customCommand || item.defaultInstallCommand}</span>
                        </div>
                      )}
                    </div>

                    {/* Card Footer Actions */}
                    <div
                      className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Install / Uninstall Button */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => handleToggleInstall(item.id, e)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            item.installed
                              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30"
                              : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700"
                          }`}
                        >
                          {item.installed ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Installed</span>
                            </>
                          ) : (
                            <>
                              <Download className="h-3.5 w-3.5" />
                              <span>Install</span>
                            </>
                          )}
                        </button>

                        {/* Inline Update Button if update available */}
                        {item.hasUpdate && (
                          <button
                            onClick={(e) => handleUpdateItem(item.id, e)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-500 text-xs font-medium shadow-sm transition-colors"
                            title={`Update from ${item.currentVersion} to ${item.latestVersion}`}
                          >
                            <ArrowUpCircle className="h-3.5 w-3.5" />
                            <span>Update</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setEditingItem(item)}
                          title="Configure command, notes, or tags"
                          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-md transition-colors"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={(e) => handleAskAiAboutItem(item, e)}
                          title="Ask AI Assistant about this resource"
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-colors"
                        >
                          <Sparkles className="h-3 w-3" />
                          <span className="text-[11px]">Ask AI</span>
                        </button>

                        <button
                          onClick={(e) => handleRemoveItem(item.id, item.name, e)}
                          title="Remove card from collection"
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Dense Table / List View */
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Resource & Repo</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Version</th>
                    <th className="px-4 py-3">Command</th>
                    <th className="px-4 py-3 text-center">Installed</th>
                    <th className="px-4 py-3 text-center">Enabled</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setEditingItem(item)}
                      className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                          <span>{item.name}</span>
                          {item.hasUpdate && (
                            <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 px-1 rounded border border-amber-500/20">
                              NEW
                            </span>
                          )}
                        </div>
                        <a
                          href={item.githubUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] text-slate-400 hover:text-indigo-300 font-mono flex items-center gap-1"
                        >
                          <span>{item.repo}</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{item.categoryLabel}</td>
                      <td className="px-4 py-3 font-mono text-[11px]">
                        {item.hasUpdate ? (
                          <span className="text-amber-400 font-medium">
                            {item.currentVersion} → {item.latestVersion}
                          </span>
                        ) : (
                          <span className="text-slate-400">{item.currentVersion || "v1.0.0"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-400 max-w-xs truncate">
                        {item.customCommand || item.defaultInstallCommand}
                      </td>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleToggleInstall(item.id, e)}
                          className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                            item.installed
                              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                              : "bg-slate-800 text-slate-400 hover:text-white"
                          }`}
                        >
                          {item.installed ? "Installed" : "Install"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleToggleEnable(item.id, e)}
                          className={`relative inline-flex h-4.5 w-8 items-center rounded-full transition-colors ${
                            item.enabled ? "bg-indigo-600" : "bg-slate-700"
                          }`}
                        >
                          <span
                            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                              item.enabled ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {item.hasUpdate && (
                            <button
                              onClick={(e) => handleUpdateItem(item.id, e)}
                              className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-medium"
                              title="Update to latest release"
                            >
                              Update
                            </button>
                          )}
                          <button
                            onClick={() => setEditingItem(item)}
                            className="p-1 text-slate-400 hover:text-white"
                            title="Edit"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleAskAiAboutItem(item, e)}
                            className="p-1 text-indigo-400 hover:text-indigo-300"
                            title="Ask AI"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleRemoveItem(item.id, item.name, e)}
                            className="p-1 text-slate-500 hover:text-rose-400"
                            title="Remove card"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {/* AI Pane on the right */}
      <AiPane
        isOpen={isAiPaneOpen}
        onClose={() => setIsAiPaneOpen(false)}
        items={items}
        prefilledPrompt={prefilledAiPrompt}
        onClearPrefilledPrompt={() => setPrefilledAiPrompt(undefined)}
      />

      {/* Item Custom Configuration Modal */}
      <CustomConfigModal
        item={editingItem}
        isOpen={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        onSave={handleSaveItem}
        onAskAi={(prompt) => {
          setIsAiPaneOpen(true);
          setPrefilledAiPrompt(prompt);
        }}
        onUpdateItem={handleUpdateItem}
        onRemoveItem={(id) => {
          setItems((prev) => prev.filter((i) => i.id !== id));
          setEditingItem(null);
        }}
      />

      {/* Release & Update Center Modal */}
      <UpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        items={items}
        onUpdateItem={handleUpdateItem}
        onUpdateAll={handleUpdateAll}
        onAskAi={(prompt) => {
          setIsAiPaneOpen(true);
          setPrefilledAiPrompt(prompt);
        }}
        isChecking={isCheckingUpdates}
        onCheckAgain={handleCheckUpdates}
        lastCheckedTime={lastCheckedTime}
      />

      {/* Add Item Modal */}
      <AddItemModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddItem}
      />

      {/* Export & Script Generator Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        items={items}
      />
    </div>
  );
}
