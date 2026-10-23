import React, { useState, useMemo, useEffect, useRef } from "react";
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
  Loader2,
} from "lucide-react";
import type { ManageableItem } from "./data/items";
import { readApiJson, useCatalog } from "./useCatalog";
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
  const [workspace, setWorkspace] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await readApiJson(await fetch("/api/workspace"));
        if (!cancelled) {
          setWorkspace(data.workspace);
        }
      } catch (error) {
        if (!cancelled) setWorkspaceError(error instanceof Error ? error.message : "Codex folder unavailable.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const assistantToggle = useRef<HTMLButtonElement>(null);
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
        <div className="workspace-breadcrumb">
          <Terminal aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--dc-accent)]" />
          <h1>DotCode</h1>
          <span className="workspace-version hidden sm:inline">LOCAL</span>
        </div>

        {/* Right Header Actions */}
        <div className="flex min-w-0 items-center gap-2">
          <button
            ref={assistantToggle}
            type="button"
            id="assistant-toggle"
            aria-label={isAiPaneOpen ? "Close assistant" : "Open assistant"}
            aria-expanded={isAiPaneOpen}
            aria-controls="assistant-pane"
            onClick={() => setIsAiPaneOpen(!isAiPaneOpen)}
            className="rt-button"
          >
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-[var(--dc-accent)]" />
            <span className="hidden sm:inline">{isAiPaneOpen ? "Close assistant" : "Assistant"}</span>
          </button>
        </div>
      </header>
      {workspaceError && <p role="alert" className="px-4 py-2 text-xs text-(--ctp-red)">{workspaceError}</p>}

      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <nav aria-label="Dashboard sections" className="workspace-nav flex shrink-0 flex-col overflow-y-auto border-r">
          {([
            ["library", "Tool Library", Library],
            ["services", "Services", Terminal],
            ["models", "Models", Cpu],
            ["agents", "Agent Setup", Wrench],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              title={label}
              aria-current={activeTab === id ? "page" : undefined}
              onClick={() => setActiveTab(id)}
              className="workspace-nav-item"
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="sr-only">{label}</span>
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {activeTab !== "library" ? (
            <RuntimePane tab={activeTab} />
          ) : (
            <main className="runtime-surface" aria-busy={!catalogLoaded}>
              <div className="runtime-intro">
                <div className="runtime-title-group">
                  <span className="runtime-surface-icon">
                    <Library aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2>Tool Library</h2>
                    <p className="runtime-description">
                      Manage, install, and customize curated developer tools and engineering resources.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => void handleCheckUpdates(undefined, e)}
                    disabled={isCheckingUpdates}
                    className="rt-button"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isCheckingUpdates ? "animate-spin" : ""}`} />
                    <span>{isCheckingUpdates ? "Checking..." : "Check updates"}</span>
                  </button>
                </div>
              </div>

              <div className="runtime-context">
                <span><Layers aria-hidden="true" className="h-3.5 w-3.5" />{totalCount} items cataloged</span>
                <span className="text-[var(--ctp-green)]"><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />{installedCount} installed</span>
                {updatesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsUpdateModalOpen(true)}
                    className="text-[var(--ctp-peach)] hover:underline flex items-center gap-1 font-medium"
                  >
                    <ArrowUpCircle aria-hidden="true" className="h-3.5 w-3.5" />
                    {updatesCount} updates available
                  </button>
                )}
                <span>Last checked: {lastCheckedTime}</span>
              </div>

              <div className="runtime-content">
                {inventoryError && (
                  <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {inventoryError}
                  </p>
                )}

                {/* Categories & Actions */}
                <div className="runtime-toolbar">
                  <div className="runtime-tabs" aria-label="Tool categories">
                    {[
                      { id: null, label: "All Items", count: items.length },
                      ...categories,
                    ].map((tab) => (
                      <button
                        key={tab.id ?? "all-items"}
                        type="button"
                        onClick={() => setSelectedCategory(tab.id)}
                        aria-pressed={selectedCategory === tab.id}
                      >
                        <span>{tab.label}</span>
                        <span>{tab.count}</span>
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => categorize("Organize my entire catalog into meaningful categories. Reuse suitable groups. Do not install anything.")}
                    className="rt-button"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-[var(--dc-accent)]" />
                    <span>Organize with AI</span>
                  </button>
                </div>

                {/* Search & Status Filters */}
                <div className="runtime-toolbar">
                  <label className="runtime-search">
                    <Search aria-hidden="true" className="h-4 w-4" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={`Search ${items.length} tools, apps, tags...`}
                      aria-label="Search tool library"
                    />
                  </label>

                  <fieldset className="runtime-segments">
                    <legend className="sr-only">Status filter</legend>
                    {[
                      { id: "all", label: `All (${items.length})` },
                      { id: "installed", label: `Installed (${installedCount})` },
                      { id: "updates", label: `Updates (${updatesCount})` },
                      { id: "available", label: `Available (${items.length - installedCount})` },
                    ].map((s) => (
                      <label key={s.id} className={selectedStatus === s.id ? "selected" : ""}>
                        <input
                          type="radio"
                          name="statusFilter"
                          value={s.id}
                          checked={selectedStatus === s.id}
                          onChange={() => setSelectedStatus(s.id as any)}
                        />
                        {s.label}
                      </label>
                    ))}
                  </fieldset>

                  <div className="runtime-segments ml-auto">
                    <button
                      type="button"
                      onClick={() => setViewMode("grid")}
                      className={`p-1.5 rounded ${viewMode === "grid" ? "bg-[var(--dc-raised)] text-[var(--dc-ink)]" : "text-[var(--dc-muted)]"}`}
                      title="Grid view"
                      aria-label="Grid view"
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("table")}
                      className={`p-1.5 rounded ${viewMode === "table" ? "bg-[var(--dc-raised)] text-[var(--dc-ink)]" : "text-[var(--dc-muted)]"}`}
                      title="List view"
                      aria-label="List view"
                    >
                      <List className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Main Cards Content */}
                {!catalogLoaded ? (
                  <div className="runtime-empty">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-[var(--dc-accent)]" />
                    Loading catalog...
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="runtime-empty">
                    <p>No items match your filter.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setSelectedCategory(null);
                        setSelectedStatus("all");
                      }}
                      className="rt-button rt-primary mt-3"
                    >
                      Reset filters
                    </button>
                  </div>
                ) : viewMode === "grid" ? (
                  <section aria-label="Tool cards" className="runtime-card-grid">
                    {filteredItems.map((item) => (
                      <article
                        key={item.id}
                        draggable
                        onDragStart={(event) => startItemDrag(event, item)}
                        title="Click to edit/configure, or drag into chat"
                        onClick={() => setEditingItem(item)}
                        className="runtime-card cursor-pointer transition-all hover:border-[var(--dc-accent)]"
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="runtime-item-icon">
                              <Layers className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h3 className="text-sm font-semibold truncate hover:text-[var(--dc-accent)]">
                                  {item.name}
                                </h3>
                                {item.hasUpdate && (
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setIsUpdateModalOpen(true);
                                    }}
                                    className="text-[10px] font-semibold text-[var(--ctp-peach)] bg-[var(--ctp-peach)]/10 border border-[var(--ctp-peach)]/30 px-1.5 py-0.5 rounded hover:bg-[var(--ctp-peach)]/20"
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
                                className="text-[11px] text-[var(--dc-muted)] hover:text-[var(--dc-ink)] flex items-center gap-1 font-mono truncate"
                              >
                                <span>{item.repo}</span>
                                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                              </a>
                            </div>
                          </div>
                          <span className={`runtime-badge shrink-0 ${item.installed ? "is-enabled" : ""}`}>
                            {item.installed ? "Installed" : "Available"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-[var(--dc-muted)] my-2">
                          <span>{item.categoryLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.primaryLanguage}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{item.currentVersion || "Not verified"}</span>
                        </div>

                        <p className="text-xs text-[var(--dc-muted)] leading-relaxed line-clamp-2 mb-3">
                          {item.description}
                        </p>

                        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
                          <button
                            type="button"
                            onClick={(event) => void handleCheckUpdates(item.id, event)}
                            disabled={isCheckingUpdates}
                            aria-label={`Check updates for ${item.name}`}
                            className="flex items-center gap-1 rounded px-1.5 py-1 text-[var(--dc-muted)] hover:bg-[var(--dc-raised)] disabled:opacity-50"
                          >
                            <RefreshCw className={`h-3 w-3 ${checkingUpdateIds.includes(item.id) ? "animate-spin" : ""}`} />
                            {checkingUpdateIds.includes(item.id) ? "Checking..." : "Check updates"}
                          </button>
                          <span role="status" className={item.hasUpdate ? "text-[var(--ctp-peach)]" : "text-[var(--dc-muted)]"}>
                            {item.updateStatus}
                          </span>
                        </div>

                        {(item.customCommand || item.defaultInstallCommand) && (
                          <div className="mb-3 rounded-lg bg-[var(--dc-paper)] border border-[var(--dc-rule)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--dc-muted)] truncate flex items-center gap-1.5">
                            <Terminal className="h-3 w-3 text-[var(--dc-accent)] shrink-0" />
                            <span className="truncate">{item.customCommand || item.defaultInstallCommand}</span>
                          </div>
                        )}

                        <div
                          className="pt-3 border-t border-[var(--dc-rule)] flex items-center justify-between text-xs gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => handleToggleInstall(item.id, e)}
                              className={`rt-button ${item.installed ? "" : "rt-primary"}`}
                            >
                              {item.installed ? (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--ctp-green)]" />
                                  <span>Installed</span>
                                </>
                              ) : (
                                <>
                                  <Download className="h-3.5 w-3.5" />
                                  <span>Install</span>
                                </>
                              )}
                            </button>

                            {item.hasUpdate && (
                              <button
                                type="button"
                                onClick={(e) => handleUpdateItem(item.id, e)}
                                className="rt-button bg-[var(--ctp-peach)] text-[#11111b] border-transparent font-medium"
                                title={`Update from ${item.currentVersion} to ${item.latestVersion}`}
                              >
                                <ArrowUpCircle className="h-3.5 w-3.5" />
                                <span>Update</span>
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingItem(item)}
                              title="Edit card details"
                              aria-label={`Edit ${item.name}`}
                              className="rt-button"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => handleAskAiAboutItem(item, e)}
                              title="Ask AI Assistant about this resource"
                              className="rt-button text-[var(--dc-accent)]"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              <span>Ask AI</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => handleRemoveItem(item, e)}
                              title="Ask chat to remove card"
                              className="rt-button rt-danger p-2"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </section>
                ) : (
                  /* Dense Table / List View */
                  <div className="rounded-xl border border-[var(--dc-rule)] bg-[var(--dc-surface)] overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[var(--dc-paper)] border-b border-[var(--dc-rule)] text-[var(--dc-muted)] uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="px-4 py-3">Resource & Repo</th>
                          <th className="px-4 py-3">Category</th>
                          <th className="px-4 py-3">Version</th>
                          <th className="px-4 py-3">Command</th>
                          <th className="px-4 py-3 text-center">Installed</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--dc-rule)]">
                        {filteredItems.map((item) => (
                          <tr
                            key={item.id}
                            draggable
                            onDragStart={(event) => startItemDrag(event, item)}
                            title="Drag into chat, or click to edit"
                            onClick={() => setEditingItem(item)}
                            className="hover:bg-[var(--dc-raised)] cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="font-semibold text-[var(--dc-ink)] flex items-center gap-1.5">
                                <span>{item.name}</span>
                                {item.hasUpdate && (
                                  <span className="text-[9px] font-mono text-[var(--ctp-peach)] bg-[var(--ctp-peach)]/10 px-1 rounded border border-[var(--ctp-peach)]/20">
                                    NEW
                                  </span>
                                )}
                              </div>
                              <a
                                href={item.githubUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[11px] text-[var(--dc-muted)] hover:text-[var(--dc-accent)] font-mono flex items-center gap-1"
                              >
                                <span>{item.repo}</span>
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            </td>
                            <td className="px-4 py-3 text-[var(--dc-ink)]">{item.categoryLabel}</td>
                            <td className="px-4 py-3 font-mono text-[11px]">
                              {item.hasUpdate ? (
                                <span className="text-[var(--ctp-peach)] font-medium">
                                  {item.currentVersion} → {item.latestVersion}
                                </span>
                              ) : (
                                <span className="text-[var(--dc-muted)]">{item.currentVersion || "Not verified"}</span>
                              )}
                              <div role="status" className="mt-1 max-w-48 whitespace-normal text-[var(--dc-muted)]">{item.updateStatus}</div>
                            </td>
                            <td className="px-4 py-3 font-mono text-[11px] text-[var(--dc-muted)] max-w-xs truncate">
                              {item.customCommand || item.defaultInstallCommand}
                            </td>
                            <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={(e) => handleToggleInstall(item.id, e)}
                                className={`rt-button ${item.installed ? "" : "rt-primary"}`}
                              >
                                {item.installed ? "Installed" : "Install"}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={(event) => void handleCheckUpdates(item.id, event)}
                                  disabled={isCheckingUpdates}
                                  aria-label={`Check updates for ${item.name}`}
                                  title="Check updates without installing"
                                  className="p-1 text-[var(--dc-muted)] hover:text-[var(--dc-ink)] disabled:opacity-50"
                                >
                                  <RefreshCw className={`h-3.5 w-3.5 ${checkingUpdateIds.includes(item.id) ? "animate-spin" : ""}`} />
                                </button>
                                {item.hasUpdate && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleUpdateItem(item.id, e)}
                                    className="px-2 py-0.5 rounded bg-[var(--ctp-peach)] text-[#11111b] text-[11px] font-medium"
                                    title="Update to latest release"
                                  >
                                    Update
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setEditingItem(item)}
                                  className="rt-button"
                                  title="Edit card"
                                  aria-label={`Edit ${item.name}`}
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleAskAiAboutItem(item, e)}
                                  className="p-1 text-[var(--dc-accent)] hover:opacity-80"
                                  title="Ask AI"
                                >
                                  <Sparkles className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleRemoveItem(item, e)}
                                  className="p-1 text-[var(--dc-muted)] hover:text-rose-400"
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
              </div>
            </main>
          )}
        </div>

        {/* AI Assistant Pane: in-flow on desktop, overlays the workspace below the topbar on smaller screens. */}
        <AiPane
          isOpen={isAiPaneOpen}
          workspace={workspace}
          onClose={() => {
            setIsAiPaneOpen(false);
            assistantToggle.current?.focus();
          }}
          items={items}
          prefilledPrompt={prefilledAiPrompt}
          submittedPrompt={submittedAiPrompt}
          onClearSubmittedPrompt={() => setSubmittedAiPrompt(undefined)}
          onClearPrefilledPrompt={() => setPrefilledAiPrompt(undefined)}
          onInventoryChanged={refreshCatalog}
        />
      </div>

      {/* Item Custom Configuration / Edit Modal */}
      {editingItem && (
        <CustomConfigModal
          key={editingItem.id}
          item={editingItem}
          isOpen={Boolean(editingItem)}
          onClose={() => setEditingItem(null)}
          onAskAi={(prompt) => {
            setIsAiPaneOpen(true);
            setPrefilledAiPrompt(prompt);
          }}
          onUpdateItem={handleUpdateItem}
        />
      )}

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
