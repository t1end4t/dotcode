// The app uses the Library UI with persisted Cards; standalone prototype mode keeps its fixtures.
// ponytail: one Component per Card; add Component rows when exploring multi-Component repos.
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, Download, Github, Library, MessageSquare, Monitor, PanelRightClose, PanelRightOpen, Plus, Search, Star, Loader2, Terminal, X, Zap } from "lucide-react";
import "./index.css";
import { readApiJson, useCatalog } from "./useCatalog";
import { SkillControls } from "./installer";
import { GitHubSearch } from "./components/GitHubSearch";
import type { ManageableItem } from "./data/items";

type Card = {
  name: string; repo: string; kind?: ManageableItem["kind"]; referenceBadge?: "Hook" | "Library";
  description: string; backend: string; version: string; state: "available" | "enabled" | "disabled" | "unmanaged";
  avatar?: string; language?: string;
  source?: ManageableItem;
};
type GitHubRepo = { repo: string; name: string; description: string; avatar?: string; language?: string; stars: number };
type Action = "install" | "enable" | "disable" | "uninstall";
const initialCards: Card[] = [
  {
    "name": "ripgrep",
    "kind": "cli",
    "backend": "nix",
    "version": "14.1.1",
    "state": "enabled",
    "repo": "BurntSushi/ripgrep",
    "description": "ripgrep recursively searches directories for a regex pattern while respecting your gitignore",
    "avatar": "https://avatars.githubusercontent.com/u/456674?v=4",
    "language": "Rust"
  },
  {
    "name": "Zed",
    "kind": "desktop-app",
    "backend": "appimage",
    "version": "0.161.2",
    "state": "enabled",
    "repo": "zed-industries/zed",
    "description": "Code at the speed of thought – Zed is a high-performance, multiplayer code editor from the creators of Atom and Tree-sitter.",
    "avatar": "https://avatars.githubusercontent.com/u/79345384?v=4",
    "language": "Rust"
  },
  {
    "name": "Taste Skill",
    "kind": "skill",
    "backend": "files",
    "version": "a31c8ef",
    "state": "enabled",
    "repo": "Leonxlnx/taste-skill",
    "description": "Agent skills that give coding agents taste: art direction, reference images and a browser check instead of generic AI pages",
    "avatar": "https://avatars.githubusercontent.com/u/219127460?v=4",
    "language": "JavaScript"
  },
  {
    "name": "Context7",
    "kind": "mcp",
    "backend": "mise",
    "version": "1.0.0",
    "state": "disabled",
    "repo": "upstash/context7",
    "description": "Context7 Platform -- Up-to-date docs for AI agents",
    "avatar": "https://avatars.githubusercontent.com/u/74989412?v=4",
    "language": "TypeScript"
  },
  {
    "name": "llama.cpp",
    "kind": "cli",
    "backend": "nix",
    "version": "b4120",
    "state": "available",
    "repo": "ggml-org/llama.cpp",
    "description": "LLM inference in C/C++",
    "avatar": "https://avatars.githubusercontent.com/u/134263123?v=4",
    "language": "C++"
  },
  {
    "name": "Skills Manager",
    "kind": "desktop-app",
    "backend": "appimage",
    "version": "0.2.0",
    "state": "available",
    "repo": "xingkongliang/skills-manager",
    "description": "A lightweight desktop app to manage, sync, and organize AI agent skills across 50+ coding tools — Claude Code, Codex, Cursor, Copilot, Gemini CLI, and more.",
    "avatar": "https://avatars.githubusercontent.com/u/8827798?v=4",
    "language": "Rust"
  }
];
const stateLabels = { available: "Not installed", enabled: "Installed · Enabled", disabled: "Installed · Disabled", unmanaged: "Installed · Unmanaged" };
const kindLabels = { cli: "CLI", "desktop-app": "Desktop app", skill: "Skill", mcp: "MCP" };
const icons = { cli: Terminal, "desktop-app": Monitor, skill: BookOpen, mcp: MessageSquare };
const actionLabels = { install: "Install", enable: "Enable", disable: "Disable", uninstall: "Uninstall" };
type Plan = { id: string; description: string; version: string; expiresAt: number };
type Message = { role: "user" | "assistant"; text: string; planIds?: string[] };

function ConnectedLibrary() {
  const catalog = useCatalog();
  return <Prototype catalog={catalog} />;
}

function Prototype({ catalog }: { catalog?: ReturnType<typeof useCatalog> }) {
  const [demoCards, setCards] = useState(initialCards);
  const cards: Card[] = catalog ? catalog.items.map<Card>(item => {
    const badges = item.detection?.badges ?? [];
    const receipts = item.installedSkills ?? [];
    const referenceBadge = !item.installed && badges.length === 1 ? badges.find(badge => badge === "Hook" || badge === "Library") : undefined;
    const kind = receipts.length ? "skill" : item.kind ?? (badges.includes("Skill") ? "skill" : badges.includes("MCP") ? "mcp" : badges.includes("AppImage") ? "desktop-app" : badges.some(badge => ["npm CLI", "Nix flake"].includes(badge)) ? "cli" : undefined);
    return { name: item.name, repo: item.repo, description: item.description, kind: referenceBadge ? undefined : kind, referenceBadge, language: item.primaryLanguage, avatar: item.iconUrl ?? `https://github.com/${encodeURIComponent(item.repo.split('/')[0])}.png?size=80`,
      backend: receipts[0]?.recipe.backend ?? (item.receipt ? /nix/i.test(item.receipt.method) ? "nix" : /npm/i.test(item.receipt.method) ? "npm" : item.receipt.method : "—"), version: item.currentVersion ?? "—",
      state: !item.installed ? "available" : !receipts.length ? "unmanaged" : receipts.every(receipt => receipt.status === "disabled") ? "disabled" : "enabled", source: item };
  }).sort((a, b) => (a.kind ?? "").localeCompare(b.kind ?? "") || a.name.localeCompare(b.name)) : demoCards;
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [chatOpen, setChatOpen] = useState(false);
  const [contextRepo, setContextRepo] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatPending, setChatPending] = useState(false);
  const [chatError, setChatError] = useState("");
  // Install waits here while the page is not paired.
  const [installCard, setInstallCard] = useState<Card | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planNotice, setPlanNotice] = useState("");
  const [planError, setPlanError] = useState("");
  const [decidingPlan, setDecidingPlan] = useState(false);
  const plansHeading = useRef<HTMLHeadingElement>(null);
  // Held only by this page so reloads and other tabs must pair again.
  const [pairingToken, setPairingToken] = useState("");
  const [pairingDraft, setPairingDraft] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [uninstallRepo, setUninstallRepo] = useState<string | null>(null);
  const [repoInput, setRepoInput] = useState("");
  const [repoError, setRepoError] = useState("");
  const [repoInvalid, setRepoInvalid] = useState(false);
  const [repoLoading, setRepoLoading] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [repoResults, setRepoResults] = useState<GitHubRepo[] | null>(null);
  const searchRequest = useRef<AbortController | null>(null);
  const uninstallDialog = useRef<HTMLDialogElement>(null);
  const addDialog = useRef<HTMLDialogElement>(null);
  const chatInput = useRef<HTMLTextAreaElement>(null);
  const pairingInput = useRef<HTMLInputElement>(null);
  const chatToggle = useRef<HTMLButtonElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const uninstallTrigger = useRef<HTMLButtonElement | null>(null);
  const context = cards.find(card => card.repo === contextRepo);
  const uninstallCard = cards.find(card => card.repo === uninstallRepo);
  const installed = cards.filter(card => card.state !== "available").length;
  const notInstalled = (card: Card) => card.state === "available" && !card.referenceBadge;
  const visible = cards.filter(card => (kind === "all" || card.kind === kind)
    && (status === "all" || (status === "installed" ? card.state !== "available" : notInstalled(card)))
    && `${card.name} ${card.repo} ${card.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  useEffect(() => { if (chatOpen) chatInput.current?.focus(); }, [chatOpen]);
  useEffect(() => { if (chatOpen) chatEnd.current?.scrollIntoView({ block: "nearest" }); }, [chatOpen, messages, chatPending, chatError]);
  useEffect(() => () => searchRequest.current?.abort(), []);
  useEffect(() => { if (uninstallRepo) uninstallDialog.current?.showModal(); }, [uninstallRepo]);
  const loadPlans = () => fetch("/api/installer/plans").then(readApiJson).then(data => setPlans(data.plans), () => {});
  useEffect(() => {
    if (!catalog) return;
    void loadPlans();
    // Plan links from Codex CLI or Claude Code arrive as hash changes; other MCP Plans show up on focus or the next poll.
    // ponytail: 15 s polling; switch to server-sent events if Plans need to appear instantly.
    const poll = window.setInterval(() => { if (!document.hidden) void loadPlans(); }, 15000);
    for (const event of ["hashchange", "focus"]) window.addEventListener(event, loadPlans);
    return () => { window.clearInterval(poll); for (const event of ["hashchange", "focus"]) window.removeEventListener(event, loadPlans); };
  }, []);

  const act = (card: Card, action: Action) => {
    const nextState = action === "uninstall" ? "available" : action === "disable" ? "disabled" : "enabled";
    setCards(previous => previous.map(entry => entry.repo === card.repo ? { ...entry, state: nextState } : entry));
    const text = `${actionLabels[action]} ${card.name}: ${stateLabels[nextState]}.`;
    setAnnouncement(`${text} (Simulated)`);
    return text;
  };
  const askAbout = (card: Card) => { setContextRepo(card.repo); setChatOpen(true); chatInput.current?.focus(); };
  const closeChat = () => { setChatOpen(false); chatToggle.current?.focus(); };
  const requestUninstall = (card: Card, trigger: HTMLButtonElement) => { uninstallTrigger.current = trigger; setUninstallRepo(card.repo); };
  const closeUninstall = () => { uninstallDialog.current?.close(); setUninstallRepo(null); if (uninstallTrigger.current?.isConnected) uninstallTrigger.current.focus(); else chatToggle.current?.focus(); };
  const submitChat = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || chatPending || (catalog && !pairingToken)) return;
    const user: Message = { role: "user", text: `${context ? `[${context.repo}] ` : ""}${message}` };
    if (!catalog) {
      setMessages(previous => [...previous, user, { role: "assistant", text: "This prototype is not connected to an AI provider." +
        (!context ? " Use “Ask assistant” on a repository to try contextual actions." :
          context.referenceBadge ? "" : context.state === "unmanaged" ? " This installation is display-only because it has no Receipt." : ` Try the action below to update ${context.name} in the Library.`) }]);
      setDraft("");
      return;
    }
    if (await sendChat(user, { message, githubUrl: context?.source?.githubUrl })) setDraft("");
  };
  const sendChat = async (user: Message, request: { message: string; githubUrl?: string; installCardId?: string }, token = pairingToken) => {
    setChatError("");
    setChatPending(true);
    setMessages(previous => [...previous, user]);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...request,
          history: messages.slice(-8).map(({ role, text }) => ({ role, text: text.slice(0, 4000) })) }),
      });
      if (response.status === 401) setPairingToken("");
      const { reply, plans: proposed = [] } = await readApiJson(response);
      if (typeof reply !== "string" || !reply.trim()) throw new Error("Codex returned an empty answer. Try again.");
      setMessages(previous => [...previous, { role: "assistant", text: reply, planIds: proposed.map((plan: Plan) => plan.id) }]);
      if (proposed.length) void loadPlans();
      return true;
    } catch (error) {
      setMessages(previous => previous.slice(0, -1));
      setChatError(error instanceof Error && !(error instanceof TypeError) ? error.message : "Could not reach DotCode. Check the connection and try again.");
      return false;
    } finally { setChatPending(false); }
  };
  // Install only opens chat with the Card; the server attaches the saved Card and a fresh Detector result.
  const startInstall = (card: Card, token = pairingToken) => {
    setContextRepo(card.repo); setChatOpen(true);
    if (!token || !card.source) { setInstallCard(card); requestAnimationFrame(() => pairingInput.current?.focus()); return; }
    setInstallCard(null);
    const message = `Install ${card.name}.`;
    void sendChat({ role: "user", text: `[${card.repo}] ${message}` }, { message, installCardId: card.source.id }, token);
  };
  const decidePlan = async (plan: Plan, decision: "approve" | "reject") => {
    setDecidingPlan(true); setPlanError(""); setPlanNotice("");
    try {
      const response = await fetch(`/api/installer/${decision}`, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${pairingToken}` }, body: JSON.stringify({ planId: plan.id }),
      });
      if (response.status === 401) setPairingToken("");
      await readApiJson(response);
      setPlanNotice(decision === "approve" ? "Skill installed." : "Plan rejected.");
      if (decision === "approve") await catalog?.refreshCatalog();
    } catch (error) {
      setPlanError(error instanceof Error && !(error instanceof TypeError) ? error.message : "Could not reach DotCode. Check the connection and try again.");
    } finally {
      await loadPlans();
      setDecidingPlan(false);
      plansHeading.current?.focus();
    }
  };
  const editRepoQuery = (value: string) => {
    searchRequest.current?.abort();
    setRepoInput(value); setRepoError(""); setRepoInvalid(false); setRepoLoading(false); setRepoResults(null);
  };
  const closeDiscovery = () => {
    searchRequest.current?.abort(); setRepoLoading(false); setDiscoveryOpen(false); addDialog.current?.close();
  };
  const searchGitHub = async (value = repoInput) => {
    searchRequest.current?.abort();
    const input = value.trim();
    setRepoError(""); setRepoInvalid(false); setRepoResults(null); setRepoLoading(false);
    if (!input) { setRepoError("Enter a repository name, owner/repo or a GitHub URL."); setRepoInvalid(true); return; }
    let lookup = input;
    if (input.includes("://")) {
      try {
        const url = new URL(input);
        if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password) throw new Error();
        lookup = url.pathname.replace(/^\//, "");
      } catch { setRepoError("Use a public GitHub URL, for example https://github.com/owner/repo."); setRepoInvalid(true); return; }
    }
    const exact = /^([a-z\d][a-z\d-]{0,38})\/([a-z\d_.-]{1,100})\/?$/i.exec(lookup);
    const name = exact?.[2].replace(/\.git$/i, "");
    if ((input.includes("://") && !exact) || (exact && (!name || [".", ".."].includes(name)))) {
      setRepoError("Use a public GitHub repository URL, for example https://github.com/owner/repo."); setRepoInvalid(true); return;
    }
    const controller = new AbortController(); searchRequest.current = controller; setRepoLoading(true);
    const endpoint = exact
      ? `https://api.github.com/repos/${encodeURIComponent(exact[1])}/${encodeURIComponent(name!)}`
      : `https://api.github.com/search/repositories?q=${encodeURIComponent(input)}&per_page=10`;
    try {
      // ponytail: first 10 matches; add pagination when browsing beyond a focused search is needed.
      const response = await fetch(endpoint, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), headers: { Accept: "application/vnd.github+json" } });
      if (!response.ok) throw new Error(response.status === 403 || response.status === 429
        ? "GitHub's request limit was reached. Try again after it resets."
        : response.status === 404 ? "Repository not found. Check the name and that it is public."
        : `GitHub search is unavailable (${response.status}). Try again.`);
      const data = await response.json();
      const entries = exact ? [data] : data.items;
      if (!Array.isArray(entries)) throw new Error("GitHub returned an unexpected response. Try again.");
      const results = entries.map((entry: unknown): GitHubRepo => {
        if (!entry || typeof entry !== "object" || !("full_name" in entry) || typeof entry.full_name !== "string"
          || !/^[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]{1,100}$/i.test(entry.full_name)) throw new Error("GitHub returned invalid repository data. Try again.");
        const raw = entry as Record<string, unknown>;
        const owner = raw.owner && typeof raw.owner === "object" ? raw.owner as Record<string, unknown> : {};
        return { repo: entry.full_name, name: entry.full_name.split("/")[1], description: typeof raw.description === "string" && raw.description ? raw.description : "No description provided.",
          avatar: typeof owner.avatar_url === "string" && owner.avatar_url.startsWith("https://avatars.githubusercontent.com/") ? owner.avatar_url : undefined,
          language: typeof raw.language === "string" ? raw.language : undefined,
          stars: typeof raw.stargazers_count === "number" && Number.isFinite(raw.stargazers_count) ? Math.max(0, Math.floor(raw.stargazers_count)) : 0 };
      });
      if (!controller.signal.aborted) setRepoResults(results);
    } catch (error) {
      if (!controller.signal.aborted) setRepoError(error instanceof Error && error.name !== "TypeError" && error.name !== "TimeoutError"
        ? error.message : "Could not reach GitHub. Check your connection and try again.");
    } finally { if (!controller.signal.aborted) setRepoLoading(false); }
  };
  const addRepo = (repo: GitHubRepo) => {
    setCards(previous => previous.some(card => card.repo.toLowerCase() === repo.repo.toLowerCase()) ? previous
      : [...previous, { ...repo, backend: "—", version: "—", state: "available" }]);
    setQuery(""); setKind("all"); setStatus("all");
    setAnnouncement(`Added ${repo.repo} to Library. Not installed.`);
  };

  return <div className={`prototype ${chatOpen ? "chat-open" : ""}`}>
    <a className="skip-link" href="#library">Skip to Library</a>
    <header className="topbar">
      <a className="brand" href="/" aria-label="DotCode Library"><span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>dotcode</a>
      <a className="header-location" href="#library" aria-current="page">Library</a>
      <div className="topbar-actions"><span className="prototype-label">Prototype</span><span className="local-label"><Monitor size={14} />Local workspace</span><button ref={chatToggle} className={`button assistant-toggle ${chatOpen ? "is-active" : ""}`} aria-expanded={chatOpen} aria-controls="assistant" onClick={() => chatOpen ? closeChat() : setChatOpen(true)}>{chatOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}<span>Assistant</span></button></div>
    </header>
    <div className="workspace">
      <main id="library" className="library" tabIndex={-1}>
        <div className="library-heading"><div><h1>Library</h1><p>{cards.length} repositories <span> / </span> {installed} installed</p></div><button className="button primary" onClick={() => { editRepoQuery(""); setDiscoveryOpen(true); setAnnouncement(""); addDialog.current?.showModal(); }}><Plus size={16} />Add repository</button></div>
        <div className="toolbar"><div className="status-tabs" role="group" aria-label="Installation status">{[["all", "All repositories", cards.length], ["installed", "Installed", installed], ["available", "Not installed", cards.filter(notInstalled).length]].map(([value, label, count]) => <button key={value} aria-pressed={status === value} className={status === value ? "active" : ""} onClick={() => setStatus(String(value))}>{label}<span>{count}</span></button>)}</div><div className="search-filters"><label className="search"><Search size={15} /><span className="sr-only">Search Library</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search repositories…" /></label><label className="kind-filter"><span className="sr-only">Kind</span><select value={kind} onChange={event => setKind(event.target.value)}><option value="all">All kinds</option>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={13} /></label></div></div>
        {catalog?.inventoryError && <p role="alert" className="library-error">{catalog.inventoryError}</p>}
        {catalog && !catalog.catalogLoaded ? <p role="status">Loading Library…</p> : visible.length ? <div className="card-grid">{visible.map(card => { const Icon = card.referenceBadge === "Hook" ? Zap : card.referenceBadge === "Library" ? Library : card.kind ? icons[card.kind] : Github; return <article key={card.repo} className={`tool-card ${contextRepo === card.repo && chatOpen ? "in-context" : ""}`} aria-label={card.name}>
          <header className="card-heading"><span className="owner-avatar">{card.avatar ? <img src={card.avatar} width="32" height="32" alt="" /> : <Github size={26} />}</span><div className="card-identity"><h2><a href={`https://github.com/${card.repo}`} target="_blank" rel="noreferrer">{card.name}<span className="sr-only"> (opens in a new tab)</span></a></h2><a className="owner" href={`https://github.com/${card.repo}`} target="_blank" rel="noreferrer"><span>{card.repo.split("/")[0]}</span><ArrowUpRight size={12} /><span className="sr-only"> (opens in a new tab)</span></a></div><span className="kind-label"><Icon size={12} />{card.referenceBadge ?? (card.kind ? kindLabels[card.kind] : "Unknown")}</span></header>
          <p className="card-description">{card.description}</p>
          {card.source && <div className="card-meta discovery-meta"><span><Star size={12} />{(card.source.stars ?? 0).toLocaleString("en-US")} stars</span><span>{card.language}</span>{card.source.latestReleaseAt && <span>Latest release: <time dateTime={card.source.latestReleaseAt}>{card.source.latestReleaseAt.slice(0, 10)}</time></span>}</div>}
          <div className="card-installation"><span className={`status ${card.state}`}><span className="status-dot" />{card.referenceBadge ? "Not installable" : stateLabels[card.state]}</span><span className="version">{card.state !== "available" ? <><code>{card.version}</code><span>{card.backend}</span></> : card.language || "Details unavailable"}</span></div>
          <footer className="card-actions"><button className="text-button ask-ai" disabled={chatPending} onClick={() => askAbout(card)} aria-label={`Ask assistant about ${card.name}`}><MessageSquare size={14} />Ask assistant</button>{!card.referenceBadge && <div>{card.source && catalog ? <SkillControls item={card.source} onChanged={catalog.refreshCatalog} onInstall={() => startInstall(card)} installDisabled={chatPending} /> : card.state === "available" ? <button className="button install-button" disabled={card.backend === "—"} title={card.backend === "—" ? "Installation details are unavailable in this prototype" : undefined} aria-label={`Install ${card.name}`} onClick={() => act(card, "install")}><Download size={14} />Install</button> : <><button className="text-button uninstall-button" aria-label={`Uninstall ${card.name}`} onClick={event => requestUninstall(card, event.currentTarget)}>Uninstall</button><button className="enable-switch" role="switch" aria-checked={card.state === "enabled"} aria-label={`Enable ${card.name}`} onClick={() => act(card, card.state === "enabled" ? "disable" : "enable")}><span className="sr-only">{card.state === "enabled" ? "Enabled" : "Disabled"}</span><span className="switch-track"><span /></span></button></>}</div>}</footer>
        </article>; })}</div> : <div className="empty"><Search size={24} /><h2>{cards.length ? "No matching repositories" : "Your Library is empty"}</h2><p>{cards.length ? "Try another search or clear your filters." : "Use Add repository to search GitHub and save your first Card."}</p>{cards.length > 0 && <button className="button" onClick={() => { setQuery(""); setKind("all"); setStatus("all"); }}>Clear filters</button>}</div>}
        {catalog && <section className="unmanaged-inventory pending-plans" aria-labelledby="plans-heading">
          <h2 id="plans-heading" ref={plansHeading} tabIndex={-1}>Pending Plans</h2>
          <p>Proposed by the Assistant or another MCP client. Nothing installs until you approve.</p>
          {planNotice && <p role="status">{planNotice}</p>}
          {planError && <p role="alert" className="library-error">{planError}</p>}
          {!pairingToken && plans.length > 0 && <p>Pair this page in the Assistant to approve or reject.</p>}
          {plans.length ? <ul aria-label="Pending Plans">{plans.map(plan => <li key={plan.id} id={`plan-${plan.id}`}>
            <strong>{plan.description}</strong>
            <br />Version <code>{plan.version.slice(0, 12)}</code> · expires <time dateTime={new Date(plan.expiresAt).toISOString()}>{new Date(plan.expiresAt).toLocaleTimeString()}</time>
            <div className="plan-actions"><button className="button primary" disabled={decidingPlan || !pairingToken} onClick={() => void decidePlan(plan, "approve")}>Approve</button><button className="button" disabled={decidingPlan || !pairingToken} onClick={() => void decidePlan(plan, "reject")}>Reject</button></div>
          </li>)}</ul> : <p>No pending Plans.</p>}
        </section>}
        {catalog && <section className="unmanaged-inventory" aria-labelledby="unmanaged-heading">
          <h2 id="unmanaged-heading">Unmanaged</h2>
          <p>Found on this machine, not managed by DotCode. Display only.</p>
          {!catalog.unmanaged ? <p role="status">Scanning…</p> : "error" in catalog.unmanaged ? <p role="alert" className="library-error">Unmanaged scan unavailable: {catalog.unmanaged.error}</p> : <>
            {catalog.unmanaged.warnings.length > 0 && <ul className="unmanaged-warnings" aria-label="Conflict warnings">{catalog.unmanaged.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
            {catalog.unmanaged.items.length ? <details>
              <summary>{catalog.unmanaged.items.length} detected</summary>
              <ul aria-label="Detected items">{catalog.unmanaged.items.map(item => <li key={JSON.stringify([item.kind, item.agent, item.name, item.path])}>
                <strong>{item.name}</strong> · {item.kind === "cli" ? "CLI" : item.kind}{item.agent && ` · ${item.agent}`}{!!item.ports?.length && ` · Port ${item.ports.join(", ")}`}
                <br /><code>{item.path}</code>
              </li>)}</ul>
            </details> : <p>No Unmanaged items found.</p>}
          </>}
        </section>}
        <footer className="library-footer"><span><Github size={13} />Repository descriptions from GitHub About.</span><span>{catalog ? "Cards saved to Library · installs need your approval" : "Demo installations · reload to reset"}</span></footer>
      </main>
      <aside id="assistant" className="assistant" aria-label="Assistant" hidden={!chatOpen} onKeyDown={event => { if (event.key === "Escape") closeChat(); }}>
        <header className="assistant-header"><div><MessageSquare size={16} /><h2>Assistant</h2><span className="demo-label">{catalog ? "Approval required" : "Demo"}</span></div><button className="icon-button" onClick={closeChat} aria-label="Close assistant"><PanelRightClose size={17} /></button></header>
        <div className="chat-messages" role="log" aria-label="Conversation"><div className="chat-intro"><h3>{context ? context.name : "Ask about a repository"}</h3><p>{context ? context.description : "Select Ask assistant on a Card or include a GitHub repository in your question."}</p><div className="assistant-mode">{catalog ? "Powered by Codex. The Assistant can look up repositories and propose Plans. Nothing installs until you approve a Plan." : "Preview only. AI is not connected."}</div>{!catalog && <button className="chat-suggestion" onClick={() => { setContextRepo("ggml-org/llama.cpp"); setDraft("Help me install llama.cpp on this machine"); chatInput.current?.focus(); }}><span>Install llama.cpp</span><ArrowRight size={14} /></button>}<button className="chat-suggestion" disabled={chatPending} onClick={() => { setDraft("Review the tools I have installed"); chatInput.current?.focus(); }}><span>Review installed tools</span><ArrowRight size={14} /></button></div>{messages.map((message, index) => <div key={index} className={`chat-message ${message.role}`}><span>{message.role === "user" ? "You" : catalog ? "Assistant" : "Assistant · demo"}</span><p>{message.text}</p>{message.planIds?.map(id => <a key={id} className="text-button" href={`/#plan-${id}`}>Review Plan</a>)}</div>)}{chatPending && <p className="chat-message" role="status">Waiting for Codex…</p>}{chatError && <p className="chat-message chat-error" role="alert">{chatError}</p>}<div ref={chatEnd} /></div>
        {context && <div className="chat-context"><div><Github size={14} /><strong>{context.name}</strong><button className="icon-button" aria-label="Remove repository context" disabled={chatPending} onClick={() => setContextRepo(null)}><X size={13} /></button></div><span>{context.repo}</span><div className="context-actions">{!catalog && !context.referenceBadge && context.state !== "unmanaged" && (context.state === "available" ? ["install"] as const : [context.state === "enabled" ? "disable" : "enable"] as const).map(action => <button key={action} className="button" disabled={context.backend === "—"} onClick={() => { const result = act(context, action); setMessages(previous => [...previous, { role: "assistant", text: `${result} Simulated action; your machine is unchanged.` }]); }}>{actionLabels[action]} {context.name}</button>)}<span className={`status ${context.state}`}><span className="status-dot" />{context.referenceBadge ? "Not installable" : stateLabels[context.state]}</span></div></div>}
        {catalog && !pairingToken ? <form className="chat-composer chat-pairing" onSubmit={event => {
          event.preventDefault();
          const value = pairingDraft.trim();
          if (!/^[\w-]{43}$/.test(value)) { setChatError("Paste the 43-character token from DOTCODE_HOME/assistant-token."); return; }
          setPairingToken(value); setPairingDraft(""); setChatError(""); requestAnimationFrame(() => chatInput.current?.focus());
          if (installCard) startInstall(installCard, value);
        }}><label htmlFor="assistant-token">Pair this page</label><p id="assistant-token-help">Paste the token from <code>DOTCODE_HOME/assistant-token</code> (default <code>~/.dotcode</code>). It stays in this page until you reload.</p><div><input ref={pairingInput} id="assistant-token" type="password" autoComplete="off" spellCheck={false} value={pairingDraft} onChange={event => setPairingDraft(event.target.value)} aria-describedby="assistant-token-help" /><button className="button" type="submit" disabled={!pairingDraft.trim()}>Pair</button></div></form> :
        <form className="chat-composer" onSubmit={submitChat}><label className="sr-only" htmlFor="chat-input">Message assistant</label><textarea ref={chatInput} id="chat-input" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Ask about your tools…" rows={3} maxLength={4000} readOnly={chatPending} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><div><span>Enter to send · Shift + Enter for a new line</span><button className="send-button" type="submit" disabled={!draft.trim() || chatPending} aria-label="Send message"><ArrowRight size={16} /></button></div></form>}
      </aside>
    </div>
    <div className="action-announcement" role="status">{announcement && <><Check size={15} />{announcement}<button className="icon-button" onClick={() => setAnnouncement("")} aria-label="Dismiss notification"><X size={14} /></button></>}</div>
    <dialog ref={uninstallDialog} className="dialog" onCancel={closeUninstall}><form method="dialog"><header><h2>Uninstall {uninstallCard?.name}?</h2><button type="button" className="icon-button" onClick={closeUninstall} aria-label="Close dialog"><X size={18} /></button></header><p>The installation will be removed. The repository stays in your Library so you can install it again.</p><p className="dialog-note">Your data and configuration are kept. This is a simulated action.</p><footer><button type="button" className="button" onClick={closeUninstall}>Cancel</button><button className="button danger" onClick={() => { if (uninstallCard) act(uninstallCard, "uninstall"); closeUninstall(); }}>Uninstall</button></footer></form></dialog>
    <dialog ref={addDialog} className="dialog discovery" aria-labelledby="discovery-title" onCancel={closeDiscovery}>
      <header><div><h2 id="discovery-title"><Github size={20} />Add repository</h2><p>Find a public repository and add it to your Library.</p></div><button type="button" className="icon-button" onClick={closeDiscovery} aria-label="Close add repository dialog"><X size={18} /></button></header>
      {catalog ? discoveryOpen && <GitHubSearch items={catalog.items} onCatalogChanged={async added => { await catalog.refreshCatalog(); if (added) { setQuery(""); setKind("all"); setStatus("all"); } }} /> : <><form className="discovery-search" onSubmit={event => { event.preventDefault(); void searchGitHub(); }}><label className="discovery-query"><Search size={17} /><span className="sr-only">Search GitHub</span><input autoFocus id="repo-input" type="search" value={repoInput} onChange={event => editRepoQuery(event.target.value)} placeholder="Search GitHub or paste a repository URL…" maxLength={256} aria-invalid={repoInvalid} aria-describedby={repoInvalid ? "repo-error" : "repo-help"} /></label><button type="submit" className="button primary" disabled={repoLoading}>{repoLoading ? <Loader2 size={15} className="spinner" /> : <Search size={15} />}Search</button></form>
      <p id="repo-help" className="discovery-help">Search by name, owner/repo or GitHub URL. Adding a Card does not install it.</p>
      <div className="discovery-results" aria-busy={repoLoading}>
        {repoLoading ? <div className="discovery-message" role="status"><Loader2 size={24} className="spinner" /><h3>Searching GitHub…</h3><p>Looking for public repositories.</p></div>
          : repoError ? <div className="discovery-message search-error"><p id="repo-error" role="alert">{repoError}</p>{!repoInvalid && <button className="button" onClick={() => void searchGitHub()}>Retry search</button>}</div>
          : repoResults === null ? <div className="discovery-message"><Github size={30} /><h3>What would you like to add?</h3><p>Try a name, a topic or a tool you already use.</p><div className="suggested-searches">{["terminal tools", "agent skills", "local llm"].map(value => <button key={value} className="button" onClick={() => { setRepoInput(value); void searchGitHub(value); }}>{value}<ArrowUpRight size={12} /></button>)}</div></div>
          : repoResults.length === 0 ? <div className="discovery-message" role="status"><Search size={25} /><h3>No repositories found</h3><p>Try another name or a broader search.</p></div>
          : <><div className="discovery-result-count" role="status">{repoResults.length} {repoResults.length === 1 ? "repository" : "repositories"}{repoResults.length === 10 && " · first 10 matches"}</div>{repoResults.map(repo => {
            const existing = cards.find(card => card.repo.toLowerCase() === repo.repo.toLowerCase());
            return <article key={repo.repo} className="discovery-result" aria-label={repo.repo}><span className="owner-avatar">{repo.avatar ? <img src={repo.avatar + "&s=80"} width="32" height="32" alt="" /> : <Github size={26} />}</span><div className="discovery-result-body"><h3><a href={`https://github.com/${repo.repo}`} target="_blank" rel="noreferrer">{repo.repo}<ArrowUpRight size={12} /><span className="sr-only"> (opens in a new tab)</span></a></h3><p>{repo.description}</p><div className="discovery-meta">{repo.language && <span>{repo.language}</span>}<span><Star size={12} />{repo.stars.toLocaleString("en-US")}<span className="sr-only"> stars</span></span></div></div><div className="discovery-result-controls">{existing ? <><span className="library-badge"><Check size={13} />In Library</span><span className={`status ${existing.state}`}><span className="status-dot" />{stateLabels[existing.state]}</span></> : <button className="button" aria-label={`Add ${repo.repo} to Library`} onClick={() => addRepo(repo)}><Plus size={14} />Add to Library</button>}</div></article>;
          })}</>}
      </div></>}<footer><p className="discovery-notice" role="status">{announcement || (catalog ? "Add saves a Card without AI or installation." : "Public GitHub search · additions stay in this prototype")}</p><button className="button" onClick={closeDiscovery}>Done</button></footer>
    </dialog>
  </div>;
}

createRoot(document.getElementById("root")!).render(import.meta.env.MODE === "prototype" ? <Prototype /> : <ConnectedLibrary />);
