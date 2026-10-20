import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Box, CheckCircle2, Cpu, Download, FileText, Folder, Loader2, Play, Plus, Power, RefreshCw, Search, Server, ShieldCheck, SlidersHorizontal, Square, Trash2, X } from "lucide-react";
import { readApiJson } from "../useCatalog";

type Service = { id: string; name: string; port: number; unit: string; external: boolean; adopted: boolean; installed: boolean; running: boolean; status: string; autostart: boolean; pid: number | null; description?: string; error?: string };
type Model = { fileName: string; sizeBytes: number; projector: boolean; status: string; port?: number; error?: string; logs: string[] };
type AgentItem = { id: string; agent: "codex" | "claude"; category: "skill" | "mcp" | "instruction"; name: string; enabled: boolean; description?: string; content?: string; transport?: "http" | "stdio"; url?: string; command?: string; args?: string[] };
type Snapshot = { directory: string; workspace: string; services: Service[]; models: Model[]; importableModels: Model[]; agents: AgentItem[]; installedSkills: { agent: string; name: string; description: string; path: string }[]; backend: "llama.cpp" | "external"; endpoint: string; external: { models: string[]; error: string | null }; downloads: { fileName: string; status: string; receivedBytes: number; totalBytes: number; error: string | null }[]; hardware: { ramTotalBytes: number; ramFreeBytes: number }; history: { title: string; at: string }[] };
type Plan = { id: string; title: string; details: string[]; files: { path: string; content: string | null; remove: boolean }[] };

const bytes = (value: number) => value > 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(value / 1024 ** 2))} MB`;
const field = "rt-field";
const button = "rt-button";
const statusTone = (status: string) => ["active", "running"].includes(status) ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : ["failed", "unknown"].includes(status) ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-slate-700 bg-slate-800 text-slate-300";

export function RuntimePane({ tab }: { tab: "services" | "models" | "agents" }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [working, setWorking] = useState(false);
  const [logs, setLogs] = useState<{ title: string; text: string } | null>(null);
  const approvalRef = useRef<HTMLDialogElement>(null);
  const logsRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const refreshing = useRef(false);

  const refresh = async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try { setSnapshot(await readApiJson(await fetch("/api/runtime"))); setLoadError(""); }
    catch (reason) { setLoadError(reason instanceof Error ? reason.message : "Runtime data could not load."); }
    finally { refreshing.current = false; }
  };
  useEffect(() => { void refresh(); const timer = window.setInterval(refresh, 5000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (plan) approvalRef.current?.showModal?.(); }, [plan]);
  useEffect(() => { if (logs) logsRef.current?.showModal?.(); }, [logs]);

  const request = async (body: object) => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setWorking(true); setError(""); setNotice("");
    try { setPlan(await readApiJson(await fetch("/api/runtime/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Plan failed."); }
    finally { setWorking(false); }
  };
  const closePlan = () => { approvalRef.current?.close?.(); setPlan(null); returnFocus.current?.focus(); };
  const approve = async () => {
    if (!plan) return;
    setWorking(true);
    try {
      const result = await readApiJson(await fetch("/api/runtime/execute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId: plan.id }) }));
      setNotice(result.message); closePlan(); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Execution failed."); closePlan(); await refresh(); }
    finally { setWorking(false); }
  };
  const showLogs = async (service: Service) => {
    try { setLogs({ title: `${service.name} logs`, text: (await readApiJson(await fetch(`/api/runtime/logs?id=${encodeURIComponent(service.id)}`))).logs || "No log lines." }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Logs could not load."); }
  };

  const title = { services: ["Services", "Local processes, autostart and service logs."], models: ["Models", "GGUF library and local inference backends."], agents: ["Agent Setup", "Skills, MCP servers and project instructions."] }[tab];
  const SurfaceIcon = { services: Server, models: Cpu, agents: Bot }[tab];
  return (
    <main className="runtime-surface" aria-busy={working}>
      <div className="runtime-intro">
        <div className="runtime-title-group">
          <span className="runtime-surface-icon"><SurfaceIcon aria-hidden="true" className="h-4 w-4" /></span>
          <div className="min-w-0">
          <h2>{title[0]}</h2>
          <p className="runtime-description">{title[1]}</p>
          </div>
        </div>
        <button type="button" onClick={() => void refresh()} className={button}><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>
      <div className="runtime-context"><span><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />Changes require approval</span>{snapshot && <span title={snapshot.directory}><Folder aria-hidden="true" className="h-3.5 w-3.5" /><code>{snapshot.directory}</code></span>}</div>
      <div className="runtime-content">
      {(error || loadError) && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error || loadError}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{notice}</p>}
      {!snapshot ? <div className="flex h-48 items-center justify-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading runtime state… Actions use approval plans.</div> :
        tab === "services" ? <Services snapshot={snapshot} request={request} showLogs={showLogs} working={working} /> :
        tab === "models" ? <Models snapshot={snapshot} request={request} working={working} /> :
        <Agents snapshot={snapshot} request={request} working={working} />}
      </div>

      {plan && <dialog ref={approvalRef} aria-labelledby="runtime-plan-title" onCancel={event => { event.preventDefault(); closePlan(); }} className="runtime-dialog runtime-approval">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3"><h3 id="runtime-plan-title" className="text-sm font-semibold capitalize">Approval required: {plan.title}</h3><button type="button" aria-label="Close approval" onClick={closePlan} className="rounded p-1 text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button></div>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto p-5 text-xs">
          <ul className="list-disc space-y-1 pl-5 text-slate-300">{plan.details.map(detail => <li key={detail}>{detail}</li>)}</ul>
          {plan.files.map(file => <section key={file.path}><p className="mb-1 font-mono text-xs text-slate-400">{file.remove ? "Remove" : "Write"} {file.path}</p>{file.content != null && <pre tabIndex={0} className="max-h-72 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">{file.content}</pre>}</section>)}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3"><button type="button" onClick={closePlan} className={button}>Cancel</button><button type="button" disabled={working} onClick={() => void approve()} className={`${button} rt-primary`}>{working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Approve and run</button></div>
      </dialog>}
      {logs && <dialog ref={logsRef} aria-labelledby="service-log-title" onCancel={() => setLogs(null)} className="runtime-dialog runtime-logs">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3"><h3 id="service-log-title" className="text-sm font-semibold">{logs.title}</h3><button type="button" autoFocus aria-label="Close logs" onClick={() => { logsRef.current?.close(); setLogs(null); }} className="rounded p-1 text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button></div><pre tabIndex={0} className="max-h-[70vh] overflow-auto whitespace-pre-wrap p-5 text-xs text-slate-300">{logs.text}</pre>
      </dialog>}
    </main>
  );
}

function FormDialog({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (!dialogRef.current?.open) dialogRef.current?.showModal(); }, []);
  const finish = () => { dialogRef.current?.close(); close(); };
  return <dialog ref={dialogRef} aria-label={title} onSubmit={finish} onCancel={event => { event.preventDefault(); finish(); }} className="runtime-dialog">
    <div className="runtime-dialog-header"><h3>{title}</h3><button type="button" aria-label={`Close ${title}`} onClick={finish} className={button}><X className="h-4 w-4" /></button></div>
    <div className="runtime-dialog-body">{children}</div>
  </dialog>;
}

export function Services({ snapshot, request, showLogs, working }: { snapshot: Snapshot; request: (body: object) => void; showLogs: (service: Service) => void; working: boolean }) {
  const [draft, setDraft] = useState({ name: "", program: "", args: "", port: "8080" });
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const services = snapshot.services.filter(service => `${service.name} ${service.description ?? ""} ${service.port}`.toLowerCase().includes(query.toLowerCase()));
  return <div>
    <div className="runtime-toolbar"><div className="runtime-count"><span className="runtime-live-dot" />{snapshot.services.filter(service => service.running).length} running <span>/ {snapshot.services.length} services</span></div>
      <label className="runtime-search"><Search aria-hidden="true" className="h-4 w-4" /><input aria-label="Search services" placeholder="Search services..." value={query} onChange={event => setQuery(event.target.value)} /></label>
      <button type="button" onClick={() => setAdding(true)} className={`${button} rt-primary`}><Plus className="h-3.5 w-3.5" />Add service</button></div>
    <section aria-label="Configured services" className="runtime-card-grid">{services.map(service => <article key={service.id} className="runtime-card">
      <div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className="runtime-item-icon"><Server className="h-5 w-5" /></div><div><h3 className="text-sm font-semibold">{service.name}</h3><p className="font-mono text-xs text-slate-500">127.0.0.1:{service.port}</p></div></div><span className={`rounded-full border px-2 py-0.5 text-xs ${statusTone(service.status)}`}>{service.status}</span></div>
      <p className="mt-4 min-h-10 text-sm leading-5">{service.description || "DotCode-managed user service."}</p>
      <dl className="runtime-facts"><div><dt>Autostart</dt><dd>{service.autostart ? "Enabled" : "Disabled"}</dd></div><div><dt>Managed by</dt><dd>{service.external ? service.adopted ? "Existing unit" : "Thinking OS" : "DotCode"}</dd></div></dl>
      <p className="runtime-unit" title={service.unit}>{service.unit}</p>
      {service.error && <p className="mt-2 text-xs text-rose-300">{service.error}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        {service.external && !service.adopted ? <button type="button" disabled={working} onClick={() => request({ kind: "service", id: service.id, action: "adopt" })} className={`${button} rt-primary`}>Take over controls</button> : <>
          <button type="button" disabled={working} onClick={() => request({ kind: "service", id: service.id, action: service.running ? "stop" : "start" })} className={button}>{service.running ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{service.running ? "Stop" : "Start"}</button>
          <button type="button" disabled={working} onClick={() => request({ kind: "service", id: service.id, action: "restart" })} className={button}><RefreshCw className="h-3.5 w-3.5" />Restart</button>
          <button type="button" aria-pressed={service.autostart} disabled={working} onClick={() => request({ kind: "service", id: service.id, action: service.autostart ? "disable" : "enable" })} className={button}><Power className="h-3.5 w-3.5" />Autostart</button></>}
        <button type="button" onClick={() => showLogs(service)} className={button}><FileText className="h-3.5 w-3.5" />Logs</button>
      </div>
    </article>)}</section>
    {!services.length && <p className="runtime-empty">{query ? "No services match your search." : "No services configured. Add a local service to get started."}</p>}
    <p className="runtime-footnote">User systemd services. Taking over an existing unit does not restart it.</p>
    {adding && <FormDialog title="Add service" close={() => setAdding(false)}><form onSubmit={event => { event.preventDefault(); request({ kind: "service-create", name: draft.name, program: draft.program, args: draft.args.split("\n").map(arg => arg.trim()).filter(Boolean), port: Number(draft.port) }); }} className="space-y-4">
      <label className="runtime-label">Name<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className={`${field} mt-1`} placeholder="local-api" /></label>
      <label className="runtime-label">Executable<input required value={draft.program} onChange={event => setDraft({ ...draft, program: event.target.value })} className={`${field} mt-1`} placeholder="9router or /path/to/binary" /></label>
      <label className="runtime-label">Arguments, one per line<textarea value={draft.args} onChange={event => setDraft({ ...draft, args: event.target.value })} className={`${field} mt-1 h-24 font-mono`} placeholder={"--host\n127.0.0.1"} /></label>
      <label className="runtime-label">Port<input required type="number" min="1024" max="65535" value={draft.port} onChange={event => setDraft({ ...draft, port: event.target.value })} className={`${field} mt-1`} /></label>
      <p className="text-xs text-slate-500">No shell. Approval creates the unit only; start/autostart are separate approvals.</p>
      <button disabled={working} className={`${button} rt-primary`}>Review service</button>
    </form></FormDialog>}
  </div>;
}

export function Models({ snapshot, request, working }: { snapshot: Snapshot; request: (body: object) => void; working: boolean }) {
  const [backend, setBackend] = useState(snapshot.backend);
  const [endpoint, setEndpoint] = useState(snapshot.endpoint || "http://127.0.0.1:8000/v1");
  const [launch, setLaunch] = useState({ port: "8090", contextLength: "4096", gpuLayers: "0", projector: "" });
  const [download, setDownload] = useState({ repo: "", remoteFile: "", fileName: "" });
  const [downloading, setDownloading] = useState(false);
  const projectors = snapshot.models.filter(model => model.projector);
  return <div className="runtime-stack">
    <div className="runtime-toolbar"><div className="runtime-count"><Cpu className="h-4 w-4" />{snapshot.models.length} models <span>in DotCode storage</span></div><button type="button" onClick={() => setDownloading(true)} className={`${button} rt-primary`}><Download className="h-3.5 w-3.5" />Download GGUF</button></div>
    <section aria-labelledby="backend-title" className="runtime-panel"><div className="runtime-backend"><div><h3 id="backend-title">Inference backend</h3><p className="runtime-muted">Choose how your models run.</p></div>
      <fieldset className="runtime-segments"><legend className="sr-only">Model backend</legend>{(["llama.cpp", "external"] as const).map(value => <label key={value} className={backend === value ? "selected" : ""}><input type="radio" name="backend" value={value} checked={backend === value} onChange={() => setBackend(value)} />{value === "llama.cpp" ? "llama.cpp" : "Custom local API"}</label>)}</fieldset>
      <button type="button" disabled={working || (backend === snapshot.backend && (backend !== "external" || endpoint === snapshot.endpoint))} onClick={() => request({ kind: "backend", backend, endpoint })} className={button}>Review backend</button></div>
      {backend === "external" && <label className="runtime-label mt-4">OpenAI-compatible endpoint<input type="url" value={endpoint} onChange={event => setEndpoint(event.target.value)} className={`${field} mt-1 font-mono`} /><span className="runtime-muted">Loopback addresses only. Include /v1 if your server requires it.</span></label>}
      {snapshot.backend === "external" && <p className="mt-3 text-xs text-slate-400">{snapshot.external.error ? `Endpoint check failed: ${snapshot.external.error}` : `${snapshot.external.models.length} model(s): ${snapshot.external.models.join(", ") || "none"}`}</p>}
    </section>
    <details className="runtime-disclosure"><summary><SlidersHorizontal aria-hidden="true" className="h-4 w-4" />Launch settings<span className="runtime-muted">Port {launch.port} / context {launch.contextLength}</span></summary>
      <div className="runtime-settings-grid">{[["port", "Port", 1024, 65535], ["contextLength", "Context length", 512, 262144], ["gpuLayers", "GPU layers", 0, 999]] .map(([key, label, min, max]) => <label key={key} className="runtime-label">{label}<input type="number" min={min} max={max} value={launch[key as "port"]} onChange={event => setLaunch({ ...launch, [key]: event.target.value })} className={field} /></label>)}<label className="runtime-label">Vision projector<select value={launch.projector} onChange={event => setLaunch({ ...launch, projector: event.target.value })} className={field}><option value="">None</option>{projectors.map(model => <option key={model.fileName}>{model.fileName}</option>)}</select></label></div>
    </details>
    <section aria-label="Managed models" className="space-y-3"><div className="runtime-section-heading"><h3>Managed models</h3><span className="runtime-muted">RAM free {bytes(snapshot.hardware.ramFreeBytes)} / {bytes(snapshot.hardware.ramTotalBytes)}</span></div>
      {snapshot.models.length === 0 && <p className="runtime-empty">No managed models. Import an existing file or download a GGUF.</p>}
      {snapshot.models.map(model => <article key={model.fileName} className="runtime-card"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="runtime-item-icon"><Cpu className="h-5 w-5" /></div><div className="min-w-0"><h4 className="break-all text-sm font-medium">{model.fileName}</h4><p className="font-mono text-xs text-slate-400">{bytes(model.sizeBytes)} {model.projector ? "· projector" : "GGUF"} {model.port ? `· 127.0.0.1:${model.port}` : ""}</p></div></div><span className={`rounded-full border px-2 py-0.5 text-xs ${statusTone(model.status)}`}>{model.status}</span></div>
        {model.error && <p className="mt-2 text-xs text-rose-300">{model.error}</p>}
        {!model.projector && <div className="mt-3 flex flex-wrap gap-2">{["starting", "running"].includes(model.status) ? <button type="button" disabled={working} onClick={() => request({ kind: "model", action: "stop", fileName: model.fileName })} className={button}><Square className="h-3.5 w-3.5" />Stop</button> : <button type="button" disabled={working || snapshot.backend !== "llama.cpp"} onClick={() => request({ kind: "model", action: "start", fileName: model.fileName, port: Number(launch.port), contextLength: Number(launch.contextLength), gpuLayers: Number(launch.gpuLayers), projector: launch.projector || undefined })} className={button}><Play className="h-3.5 w-3.5" />Run</button>}
          <button type="button" disabled={working || ["starting", "running"].includes(model.status)} onClick={() => request({ kind: "model", action: "remove", fileName: model.fileName })} className={`${button} rt-danger`}><Trash2 className="h-3.5 w-3.5" />Delete copy</button></div>}
        {model.logs.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs text-slate-400">Runtime log</summary><pre tabIndex={0} className="mt-2 max-h-48 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-400">{model.logs.join("")}</pre></details>}
      </article>)}
      {snapshot.importableModels.length > 0 && <div className="pt-2"><h3 className="mb-2 text-sm font-semibold">Existing models in ~/LOCAL-AI-MODELS</h3><div className="grid gap-2 md:grid-cols-2">{snapshot.importableModels.map(model => <div key={model.fileName} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 p-3"><div className="min-w-0"><p className="truncate text-xs">{model.fileName}</p><p className="text-xs text-slate-500">{bytes(model.sizeBytes)}</p></div><button type="button" disabled={working} onClick={() => request({ kind: "model", action: "import", fileName: model.fileName })} className={button}>Copy in</button></div>)}</div></div>}
    </section>
    {downloading && <FormDialog title="Download GGUF" close={() => setDownloading(false)}><form onSubmit={event => { event.preventDefault(); request({ kind: "model", action: "download", ...download, fileName: download.fileName || download.remoteFile.split("/").at(-1) }); }} className="space-y-4"><label className="runtime-label">Hugging Face repository<input required value={download.repo} onChange={event => setDownload({ ...download, repo: event.target.value })} className={field} placeholder="owner/model-GGUF" /></label><label className="runtime-label">Repository file<input required value={download.remoteFile} onChange={event => setDownload({ ...download, remoteFile: event.target.value })} className={field} placeholder="model-Q4_K_M.gguf" /></label><label className="runtime-label">Local name<input value={download.fileName} onChange={event => setDownload({ ...download, fileName: event.target.value })} className={field} placeholder="Optional" /></label><button disabled={working} className={`${button} rt-primary`}>Review download</button></form></FormDialog>}
      {snapshot.downloads.map(item => <div key={item.fileName} className="rounded-xl border border-slate-800 p-3 text-xs"><div className="flex justify-between gap-2"><span className="truncate">{item.fileName}</span><span>{item.status}</span></div><progress className="mt-2 w-full" value={item.receivedBytes} max={item.totalBytes || undefined} aria-label={`${item.fileName} download progress`} />{item.error && <p className="text-rose-300">{item.error}</p>}{item.status === "downloading" && <button type="button" onClick={() => request({ kind: "model", action: "cancel", fileName: item.fileName })} className="mt-2 text-rose-300 hover:underline">Cancel</button>}</div>)}
  </div>;
}

export function Agents({ snapshot, request, working }: { snapshot: Snapshot; request: (body: object) => void; working: boolean }) {
  const [category, setCategory] = useState<AgentItem["category"]>("skill");
  const [agent, setAgent] = useState<"all" | AgentItem["agent"]>("all");
  const [query, setQuery] = useState("");
  const blank = { id: "", agent: "codex" as AgentItem["agent"], category, name: "", enabled: true, description: "", content: "", transport: "http" as const, url: "", command: "", args: [] as string[] };
  const [draft, setDraft] = useState<AgentItem>(blank);
  const [argText, setArgText] = useState("");
  const [editing, setEditing] = useState(false);
  const items = useMemo(() => snapshot.agents.filter(item => item.category === category && (agent === "all" || item.agent === agent) && `${item.name} ${item.description ?? ""} ${item.url ?? ""} ${item.command ?? ""}`.toLowerCase().includes(query.toLowerCase())), [snapshot.agents, category, agent, query]);
  const edit = (item: AgentItem) => { setDraft(item); setArgText((item.args ?? []).join("\n")); setEditing(true); };
  const submit = (event: React.FormEvent) => { event.preventDefault(); request({ ...draft, kind: "agent", category, args: argText.split("\n").map(arg => arg.trim()).filter(Boolean) }); };
  const categoryName = category === "mcp" ? "MCP server" : category;
  const newItem = () => { setDraft({ ...blank, agent: agent === "all" ? "codex" : agent }); setArgText(""); setEditing(true); };
  return <div><section>
    <div className="runtime-toolbar"><div className="runtime-tabs" aria-label="Agent setup type">{([["skill", "Skills"], ["mcp", "MCP servers"], ["instruction", "Instructions"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}>{label}<span>{snapshot.agents.filter(item => item.category === value && (agent === "all" || item.agent === agent)).length}</span></button>)}</div>
      <button type="button" onClick={newItem} className={`${button} rt-primary`}><Plus className="h-3.5 w-3.5" />Add {categoryName}</button></div>
    <div className="runtime-toolbar"><label className="runtime-search"><Search aria-hidden="true" className="h-4 w-4" /><input aria-label="Search agent setup" value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${categoryName}s...`} /></label>
      <select aria-label="Agent filter" value={agent} onChange={event => setAgent(event.target.value as typeof agent)} className="rt-field runtime-filter"><option value="all">All agents</option><option value="codex">Codex</option><option value="claude">Claude Code</option></select><span className="runtime-muted">{items.length} configured</span></div>
    <div className="runtime-card-grid">{items.map(item => <button type="button" key={item.id} onClick={() => edit(item)} className="runtime-card runtime-agent-card"><div className="flex items-start justify-between gap-3"><div className="runtime-item-icon">{category === "instruction" ? <FileText className="h-5 w-5" /> : category === "mcp" ? <Server className="h-5 w-5" /> : <Bot className="h-5 w-5" />}</div><span className={`runtime-badge ${item.enabled ? "is-enabled" : ""}`}>{item.enabled ? "Enabled" : "Disabled"}</span></div><h3>{item.name}</h3><p className="runtime-agent-description">{item.description || item.url || [item.command, ...(item.args ?? [])].join(" ")}</p><div className="runtime-card-footer"><span>{item.agent === "codex" ? "Codex" : "Claude Code"}</span><span>Edit configuration</span></div></button>)}
      {items.length === 0 && <p className="runtime-empty col-span-full">No DotCode-managed {category === "mcp" ? "MCP servers" : `${category}s`} yet.</p>}</div>
    <div className="runtime-scope"><Folder aria-hidden="true" className="h-4 w-4 shrink-0" /><div><p>Project scope <code>{snapshot.workspace}</code></p><p>Global agent settings stay unchanged.</p></div></div>
    {category === "skill" && snapshot.installedSkills.length > 0 && <details className="runtime-disclosure"><summary>Existing global skills <span className="runtime-muted">{snapshot.installedSkills.length} / read-only</span></summary><div className="runtime-card-grid p-4">{snapshot.installedSkills.map(skill => <div key={skill.path} className="runtime-card"><p className="text-xs font-medium">{skill.name}</p><p className="mt-1 line-clamp-2 text-xs text-slate-400">{skill.description}</p></div>)}</div></details>}
  </section>
  {editing && <FormDialog title={draft.id ? `Edit ${draft.name}` : `Add ${categoryName}`} close={() => setEditing(false)}><form onSubmit={submit} className="space-y-4">
    <label className="runtime-label">Agent<select disabled={Boolean(draft.id)} value={draft.agent} onChange={event => setDraft({ ...draft, agent: event.target.value as AgentItem["agent"] })} className={`${field} mt-1`}><option value="codex">Codex</option><option value="claude">Claude Code</option></select></label>
    <label className="runtime-label">Name<input required readOnly={Boolean(draft.id)} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className={`${field} mt-1`} placeholder="review-code" /></label>
    {category === "mcp" ? <><fieldset><legend className="text-xs text-slate-400">Transport</legend><div className="mt-1 grid grid-cols-2 gap-2">{(["http", "stdio"] as const).map(value => <label key={value} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs"><input type="radio" name="transport" checked={draft.transport === value} onChange={() => setDraft({ ...draft, transport: value })} />{value === "http" ? "HTTP URL" : "Local command"}</label>)}</div></fieldset>
      {draft.transport === "http" ? <label className="runtime-label">Server URL<input required type="url" value={draft.url ?? ""} onChange={event => setDraft({ ...draft, url: event.target.value })} className={`${field} mt-1`} placeholder="https://example.com/mcp" /></label> : <><label className="runtime-label">Command<input required value={draft.command ?? ""} onChange={event => setDraft({ ...draft, command: event.target.value })} className={`${field} mt-1`} placeholder="npx" /></label><label className="runtime-label">Arguments, one per line<textarea value={argText} onChange={event => setArgText(event.target.value)} className={`${field} mt-1 h-24 font-mono`} /></label></>}
      <p className="text-xs text-amber-300/80">Do not enter secrets. Configure credentials outside DotCode.</p></> : <><label className="runtime-label">{category === "skill" ? "When to use" : "Section title"}<input required maxLength={500} value={draft.description ?? ""} onChange={event => setDraft({ ...draft, description: event.target.value })} className={`${field} mt-1`} placeholder={category === "skill" ? "Use when reviewing code changes" : "Code style"} /></label><label className="runtime-label">{category === "skill" ? "Steps" : "Instruction"}<textarea required value={draft.content ?? ""} onChange={event => setDraft({ ...draft, content: event.target.value })} className={`${field} mt-1 h-40`} placeholder={category === "skill" ? "1. Inspect the diff.\n2. Report correctness risks." : "Prefer small, tested changes."} /></label></>}
    <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />Apply to this agent</label>
    <button disabled={working} className={`${button} rt-primary`}><Box className="h-3.5 w-3.5" />Review changes</button>
    <p className="text-xs text-slate-500">Approval shows exact files before saving.</p>
  </form></FormDialog>}</div>;
}
