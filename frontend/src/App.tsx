import React, { useState, useMemo, useEffect } from "react";
import {
  Search,
  SlidersHorizontal,
  Sparkles,
  Download,
  Trash2,
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
  Folder,
} from "lucide-react";
import type { ManageableItem } from "./data/items";
import { useCatalog } from "./useCatalog";
import { AiPane } from "./components/AiPane";
import { CustomConfigModal } from "./components/CustomConfigModal";
import { UpdateModal } from "./components/UpdateModal";
import { RuntimePane } from "./components/RuntimePane";

export default function App() {
  const { items, inventoryError, catalogLoaded, refreshCatalog, checkUpdates } = useCatalog();
  const [activeTab, setActiveTab] = useState<"library" | "services" | "models" | "agents">("library");

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<
    "all" | "installed" | "updates" | "available"
  >("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [isAiPaneOpen, setIsAiPaneOpen] = useState(false);
  const [prefilledAiPrompt, setPrefilledAiPrompt] = useState<string | undefined>();
  const [submittedAiPrompt, setSubmittedAiPrompt] = useState<string | undefined>();
  const [editingItem, setEditingItem] = useState<ManageableItem | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [checkingUpdateIds, setCheckingUpdateIds] = useState<string[]>([]);
  const isCheckingUpdates = checkingUpdateIds.length > 0;
  const [lastCheckedTime, setLastCheckedTime] = useState("Not checked");
  const requestAction = (message: string) => {
    setIsAiPaneOpen(true);
    setPrefilledAiPrompt(message);
  };

  const categorize = (message: string) => {
    setIsAiPaneOpen(true);
    setSubmittedAiPrompt(message);
  };

  const startItemDrag = (event: React.DragEvent, item: ManageableItem) => {
    event.dataTransfer.setData("text/uri-list", item.githubUrl);
    event.dataTransfer.setData("text/plain", item.githubUrl);
    event.dataTransfer.effectAllowed = "copy";
    setIsAiPaneOpen(true);
  };

  const categories = useMemo(() => Array.from(new Set(items.map(item => item.category)))
    .sort((first, second) => first.localeCompare(second))
    .map(category => ({ id: category, label: category, count: items.filter(item => item.category === category).length })), [items]);

  useEffect(() => {
    if (selectedCategory !== null && !items.some(item => item.category === selectedCategory)) setSelectedCategory(null);
  }, [items, selectedCategory]);

  // Filter & Search Logic
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Category filter
      if (selectedCategory !== null && item.category !== selectedCategory) {
        return false;
      }

      // Status filter
      if (selectedStatus === "installed" && !item.installed) return false;
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
  const updatesCount = items.filter((i) => i.hasUpdate).length;

  // Global Check for Updates action
  const handleCheckUpdates = async (id?: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (isCheckingUpdates) return;
    const targets = id ? items.filter(item => item.id === id) : items;
    setCheckingUpdateIds(targets.map(item => item.id));
    try {
      for (const item of targets) await checkUpdates(item);
      setLastCheckedTime(new Date().toLocaleString());
    } finally {
      setCheckingUpdateIds([]);
    }
  };

  // Update a single item
  const handleUpdateItem = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const item = items.find(item => item.id === id);
    if (item) requestAction(`Update ${item.githubUrl}. Inspect its recorded installation first.`);
  };

  // Update all items that have updates available
  const handleUpdateAll = () => {
    requestAction("Plan updates for installed tools. Inspect each installation and report changes before execution.");
  };

  // Toggle Install
  const handleToggleInstall = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const item = items.find(item => item.id === id);
    if (item) requestAction(`${item.installed ? "Uninstall" : "Install"} ${item.githubUrl}.`);
  };

  const handleRemoveItem = (item: ManageableItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    requestAction(`Remove the ${item.name} card (${item.githubUrl}) from my catalog. Do not uninstall it.`);
  };

  const handleAskAiAboutItem = (item: ManageableItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsAiPaneOpen(true);
    setPrefilledAiPrompt(
      `Tell me how to use and customize ${item.name} (${item.repo}) for my daily workflow. What are the best command flags or configuration patterns?`
    );
  };

  return (
    <div className="dotcode-shell flex h-dvh w-full flex-col overflow-hidden">
        <header className="workspace-topbar flex shrink-0 items-center justify-between gap-3">
          <div className="workspace-breadcrumb"><Terminal aria-hidden="true" className="h-5 w-5 shrink-0" /><h1>DotCode</h1><span className="workspace-version hidden sm:inline">LOCAL</span><span className="workspace-section hidden md:flex"><Folder aria-hidden="true" className="h-3.5 w-3.5" />{{ library: "Tool Library", services: "Services", models: "Models", agents: "Agent Setup" }[activeTab]}</span></div>

          {/* Search Bar */}
          <div className={`${activeTab === "library" ? "hidden sm:flex" : "hidden"} min-w-0 flex-1 max-w-80 items-center relative`}>
            <Search className="absolute left-3 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 39 tools, apps, courses, tags..."
              aria-label="Search tool library"
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
            {/* AI Pane Toggle Button */}
            <button
              type="button"
              aria-expanded={isAiPaneOpen}
              onClick={() => setIsAiPaneOpen(!isAiPaneOpen)}
              className="rt-button"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{isAiPaneOpen ? "Close assistant" : "Assistant"}</span>
            </button>
          </div>
        </header>

      <div className={`flex min-h-0 min-w-0 flex-1 overflow-hidden transition-all duration-200 ${isAiPaneOpen ? "lg:mr-[460px]" : ""}`}>
        <nav aria-label="Dashboard sections" className="workspace-nav flex shrink-0 flex-col overflow-y-auto border-r">
          {([
            ["library", "Tool Library", Library],
            ["services", "Services", Terminal],
            ["models", "Models", Cpu],
            ["agents", "Agent Setup", Wrench],
          ] as const).map(([id, label, Icon]) => <button key={id} type="button" aria-label={label} title={label} aria-current={activeTab === id ? "page" : undefined} onClick={() => setActiveTab(id)} className="workspace-nav-item"><Icon aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="sr-only">{label}</span></button>)}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {activeTab !== "library" ? <RuntimePane tab={activeTab} /> : <>

        {inventoryError && <p role="alert" className="px-6 py-2 text-sm text-rose-300">{inventoryError}</p>}
        {/* Filter and Metrics Toolbar */}
        <div className="border-b border-slate-800/80 bg-slate-950/40 px-6 py-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Category tabs */}
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              {[
                { id: null, label: "All Items", count: items.length },
                ...categories,
              ].map((tab) => (
                <button
                  key={tab.id ?? "all-items"}
                  onClick={() => setSelectedCategory(tab.id)}
                  aria-pressed={selectedCategory === tab.id}
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
              <button type="button" onClick={() => categorize("Organize my entire catalog into meaningful categories. Reuse suitable groups. Do not install anything.")} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs text-indigo-300 hover:bg-slate-800">
                <Sparkles className="h-3.5 w-3.5" /> Organize with AI
              </button>
            </div>

            {/* Lifecycle Status & View Switcher */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-slate-800 text-xs overflow-x-auto">
                {[
                  { id: "all", label: "All" },
                  { id: "installed", label: `Installed (${installedCount})` },
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
                </>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Items Container */}
        <main className="flex-1 overflow-y-auto p-6">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center rounded-2xl border border-dashed border-slate-800 p-8">
              <Search className="h-8 w-8 text-slate-600 mb-3" />
              <h3 className="text-sm font-semibold text-slate-200">{!catalogLoaded ? inventoryError ? "Catalog could not load" : "Loading catalog..." : "No items match your filter"}</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                {!catalogLoaded ? inventoryError ? "Your saved catalog has not been replaced. Retry after checking the server." : "Reading your saved catalog." : "Try clearing your search query or switching categories."}
              </p>
              {(catalogLoaded || inventoryError) && <button
                onClick={() => {
                  if (!catalogLoaded) return window.location.reload();
                  setSearchQuery("");
                  setSelectedCategory(null);
                  setSelectedStatus("all");
                }}
                className="mt-4 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
              >
                {catalogLoaded ? "Reset All Filters" : "Retry"}
              </button>}
            </div>
          ) : viewMode === "grid" ? (
            /* Card Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredItems.map((item) => {
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={event => startItemDrag(event, item)}
                    title="Drag into chat, or use Ask AI"
                    onClick={() => setEditingItem(item)}
                    className={`group relative flex flex-col justify-between rounded-xl border p-4 transition-all cursor-pointer ${
                      item.installed
                        ? "border-slate-700/80 bg-slate-900/90 hover:border-indigo-500/60 hover:shadow-lg hover:shadow-indigo-500/5"
                        : "border-slate-800/80 bg-slate-900/40 opacity-75 hover:opacity-100 hover:border-slate-700"
                    }`}
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                            <Layers className="h-4 w-4" />
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

                      </div>

                      {/* Unboxed Metadata (Zero-pill discipline per frontend-design) */}
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 my-2">
                        <span>{item.categoryLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.primaryLanguage}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-slate-400">
                          {item.currentVersion || "Not verified"}
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-slate-300 leading-relaxed line-clamp-2 mb-3">
                        {item.description}
                      </p>

                      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
                        <button type="button" onClick={event => void handleCheckUpdates(item.id, event)} disabled={isCheckingUpdates}
                          aria-label={`Check updates for ${item.name}`}
                          className="flex items-center gap-1 rounded px-1.5 py-1 text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50">
                          <RefreshCw className={`h-3 w-3 ${checkingUpdateIds.includes(item.id) ? "animate-spin" : ""}`} />
                          {checkingUpdateIds.includes(item.id) ? "Checking..." : "Check updates"}
                        </button>
                        <span role="status" className={item.hasUpdate ? "text-amber-400" : "text-slate-400"}>{item.updateStatus}</span>
                      </div>

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
                          title="View card details"
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
                          onClick={(e) => handleRemoveItem(item, e)}
                          title="Ask chat to remove card"
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
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      draggable
                      onDragStart={event => startItemDrag(event, item)}
                      title="Drag into chat, or use Ask AI"
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
                          <span className="text-slate-400">{item.currentVersion || "Not verified"}</span>
                        )}
                        <div role="status" className="mt-1 max-w-48 whitespace-normal text-slate-400">{item.updateStatus}</div>
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
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" onClick={event => void handleCheckUpdates(item.id, event)} disabled={isCheckingUpdates}
                            aria-label={`Check updates for ${item.name}`} title="Check updates without installing"
                            className="p-1 text-slate-400 hover:text-white focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50">
                            <RefreshCw className={`h-3.5 w-3.5 ${checkingUpdateIds.includes(item.id) ? "animate-spin" : ""}`} />
                          </button>
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
                            title="View card details"
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
                            onClick={(e) => handleRemoveItem(item, e)}
                            className="p-1 text-slate-500 hover:text-rose-400"
                            title="Ask chat to remove card"
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
        </>}
        </div>
      </div>

      {/* AI Pane on the right */}
      <AiPane
        isOpen={isAiPaneOpen}
        onClose={() => setIsAiPaneOpen(false)}
        items={items}
        prefilledPrompt={prefilledAiPrompt}
        submittedPrompt={submittedAiPrompt}
        onClearSubmittedPrompt={() => setSubmittedAiPrompt(undefined)}
        onClearPrefilledPrompt={() => setPrefilledAiPrompt(undefined)}
        onInventoryChanged={refreshCatalog}
      />

      {/* Item Custom Configuration Modal */}
      {editingItem && <CustomConfigModal
        key={editingItem.id}
        item={editingItem}
        isOpen={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        onAskAi={(prompt) => {
          setIsAiPaneOpen(true);
          setPrefilledAiPrompt(prompt);
        }}
        onUpdateItem={handleUpdateItem}
      />}

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
        onCheckAgain={() => void handleCheckUpdates()}
        lastCheckedTime={lastCheckedTime}
      />

    </div>
  );
}
