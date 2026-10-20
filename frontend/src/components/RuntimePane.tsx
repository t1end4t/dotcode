import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bot, Box, CheckCircle2, Cpu, Download, Edit3, FileText, Folder, Loader2, Play, Plus, Power, RefreshCw, Search, Server, Square, Trash2, X } from "lucide-react";
import { readApiJson } from "../useCatalog";

type Service = { id: string; name: string; port: number; unit: string; external: boolean; adopted: boolean; installed: boolean; running: boolean; status: string; autostart: boolean; pid: number | null; description?: string; program?: string; args?: string[]; command?: string; shellCommand?: string; workingDirectory?: string; scriptCommand?: string; error?: string };
type ModelSettings = { port: number; contextLength: number; gpuLayers: number; projector?: string };
type Model = { fileName: string; sizeBytes: number; projector: boolean; status: string; port?: number; settings?: ModelSettings; error?: string; logs: string[] };
const defaultModelSettings: ModelSettings = { port: 8090, contextLength: 4096, gpuLayers: 0 };
type AgentItem = { id: string; agent: "codex" | "claude"; category: "skill" | "mcp" | "instruction"; name: string; enabled: boolean; description?: string; content?: string; transport?: "http" | "stdio"; url?: string; command?: string; args?: string[] };
type Snapshot = { directory: string; workspace: string; services: Service[]; models: Model[]; importableModels: Model[]; agents: AgentItem[]; installedSkills: { agent: string; name: string; description: string; path: string }[]; backend: "llama.cpp" | "external"; endpoint: string; external: { models: string[]; error: string | null }; downloads: { fileName: string; status: string; receivedBytes: number; totalBytes: number; error: string | null }[]; hardware: { ramTotalBytes: number; ramFreeBytes: number }; history: { title: string; at: string }[] };
type Request = (body: object) => Promise<boolean> | void;

const bytes = (value: number) => value > 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(value / 1024 ** 2))} MB`;
const field = "rt-field";
const button = "rt-button";
const statusTone = (status: string) => ["active", "running"].includes(status) ? "is-enabled" : ["failed", "unknown"].includes(status) ? "is-error" : "";

export async function executeRuntimeAction(body: object) {
  const plan = await readApiJson(await fetch("/api/runtime/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return readApiJson(await fetch("/api/runtime/execute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId: plan.id }) }));
}

export function RuntimePane({ tab }: { tab: "services" | "models" | "agents" }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const [logs, setLogs] = useState<{ title: string; text: string } | null>(null);
  const logsRef = useRef<HTMLDialogElement>(null);
  const requesting = useRef(false);
  const refreshing = useRef(false);

  const refresh = async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try { setSnapshot(await readApiJson(await fetch("/api/runtime"))); setLoadError(""); }
    catch (reason) { setLoadError(reason instanceof Error ? reason.message : "Runtime data could not load."); }
    finally { refreshing.current = false; }
  };
  useEffect(() => { void refresh(); const timer = window.setInterval(refresh, 5000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (logs) logsRef.current?.showModal?.(); }, [logs]);

  const request = async (body: object) => {
    if (requesting.current) return false;
    requesting.current = true;
    setWorking(true); setError(""); setNotice("");
    try {
      const result = await executeRuntimeAction(body);
      setNotice(result.message); await refresh();
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Action failed."); await refresh(); return false; }
    finally { requesting.current = false; setWorking(false); }
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
      <div className="runtime-content">
      {(error || loadError) && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error || loadError}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{notice}</p>}
      {!snapshot ? <div className="flex h-48 items-center justify-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading runtime state…</div> :
        tab === "services" ? <Services snapshot={snapshot} error={error} request={request} showLogs={showLogs} working={working} /> :
        tab === "models" ? <Models snapshot={snapshot} error={error} request={request} working={working} /> :
        <Agents snapshot={snapshot} error={error} request={request} working={working} />}
      </div>

      {logs && <dialog ref={logsRef} aria-labelledby="service-log-title" onCancel={() => setLogs(null)} className="runtime-dialog runtime-logs">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3"><h3 id="service-log-title" className="text-sm font-semibold">{logs.title}</h3><button type="button" autoFocus aria-label="Close logs" onClick={() => { logsRef.current?.close(); setLogs(null); }} className="rounded p-1 text-slate-400 hover:bg-slate-800"><X className="h-4 w-4" /></button></div><pre tabIndex={0} className="max-h-[70vh] overflow-auto whitespace-pre-wrap p-5 text-xs text-slate-300">{logs.text}</pre>
      </dialog>}
    </main>
  );
}

function FormDialog({ title, close, children, error }: { title: string; close: () => void; children: React.ReactNode; error?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); trigger?.focus(); };
  }, []);
  const finish = () => { dialogRef.current?.close(); close(); };
  return <dialog ref={dialogRef} aria-label={title} onCancel={event => { event.preventDefault(); finish(); }} className="runtime-dialog">
    <div className="runtime-dialog-header"><h3>{title}</h3><button type="button" aria-label={`Close ${title}`} onClick={finish} className={button}><X className="h-4 w-4" /></button></div>
    <div className="runtime-dialog-body">{error && <p role="alert" className="mb-4 text-xs text-rose-300">{error}</p>}{children}</div>
  </dialog>;
}

export function Services({ snapshot, request, showLogs, working, error }: { snapshot: Snapshot; request: Request; showLogs: (service: Service) => void; working: boolean; error?: string }) {
  const [draft, setDraft] = useState({ name: "", description: "", program: "", args: "", shellCommand: "", port: "8080" });
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const [query, setQuery] = useState("");
  const edit = (service: Service | "new") => {
    setDraft(service === "new" ? { name: "", description: "", program: "", args: "", shellCommand: "", port: "8080" } : { name: service.name, description: service.description ?? "", program: service.program ?? "", args: (service.args ?? []).join("\n"), shellCommand: service.shellCommand ?? "", port: String(service.port) });
    setEditing(service);
  };
  const canEditCommand = editing === "new" || Boolean(editing && !editing.external && editing.program);
  const services = snapshot.services.filter(service => `${service.name} ${service.description ?? ""} ${service.port}`.toLowerCase().includes(query.toLowerCase()));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const restart = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("name") === "restart";
    const commandChanged = canEditCommand && (editing === "new" || (editing && (draft.program !== editing.program || draft.args !== (editing.args ?? []).join("\n"))));
    const body = { name: draft.name, port: Number(draft.port), ...(editing && editing !== "new" && editing.shellCommand !== undefined ? { shellCommand: draft.shellCommand } : commandChanged ? { program: draft.program, args: draft.args.split("\n").map(arg => arg.trim()).filter(Boolean) } : {}) };
    const result = await request(editing === "new" ? { ...body, kind: "service-create" } : { ...body, kind: "service-update", id: editing?.id, description: draft.description });
    if (result !== false && (!restart || await request({ kind: "service", id: editing !== "new" && editing?.id, action: "restart" }) !== false)) setEditing(null);
  };
  return <div>
    <div className="runtime-toolbar"><div className="runtime-count"><Server className="h-4 w-4" />{snapshot.services.filter(service => service.running).length} running <span>/ {snapshot.services.length} services</span></div>
      <label className="runtime-search"><Search aria-hidden="true" className="h-4 w-4" /><input aria-label="Search services" placeholder="Search services..." value={query} onChange={event => setQuery(event.target.value)} /></label>
      <button type="button" onClick={() => edit("new")} className={`${button} rt-primary`}><Plus className="h-3.5 w-3.5" />Add service</button></div>
    <section aria-label="Configured services" className="runtime-card-grid">{services.map(service => <article key={service.id} className={`runtime-card runtime-config-card ${service.running ? "is-live" : ""}`}>
      <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><div className="runtime-item-icon"><Server className="h-5 w-5" /></div><div className="min-w-0"><h3 className="break-words">{service.name}</h3><p className="font-mono text-xs text-slate-400">127.0.0.1:{service.port}</p></div></div><span className={`runtime-badge ${statusTone(service.status)}`}>{service.status}</span></div>
      <p className="mt-4 min-h-10 text-sm leading-5">{service.description || "DotCode-managed user service."}</p>
      <div className="runtime-state-row"><span className={`runtime-chip ${service.running ? "is-on" : ""}`}><span className="runtime-state-dot" />{service.status === "unknown" ? "Unknown" : service.running ? "Running" : "Stopped"}</span><button type="button" role="switch" aria-checked={service.autostart} aria-label={`Toggle autostart for ${service.name}`} disabled={working || !service.installed || Boolean(service.error) || (service.external && !service.adopted)} onClick={() => request({ kind: "service", id: service.id, action: service.autostart ? "disable" : "enable" })} className={`runtime-chip ${service.autostart ? "is-on" : ""} cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-(--dc-accent)`}><Power aria-hidden="true" className="h-3 w-3" />Autostart {service.autostart ? "on" : "off"}</button></div>
      <dl className="runtime-facts"><div><dt>Managed by</dt><dd>{service.external ? service.adopted ? "Existing unit" : "Thinking OS" : "DotCode"}</dd></div><div><dt>Process ID</dt><dd>{service.pid || "Not running"}</dd></div></dl>
      <p className="runtime-unit" title={service.unit}>{service.unit}</p>
      {service.error && <p className="mt-2 text-xs text-rose-300">{service.error}</p>}
      <div className="runtime-card-actions">
        {service.external && !service.adopted ? <button type="button" disabled={working} onClick={() => request({ kind: "service", id: service.id, action: "adopt" })} className={`${button} rt-primary`}>Take over controls</button> : <>
          <button type="button" disabled={working} onClick={() => request({ kind: "service", id: service.id, action: service.running ? "stop" : "start" })} className={`${button} ${service.running ? "" : "rt-primary"}`}>{service.running ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{service.running ? "Stop" : "Start"}</button>
          <button type="button" disabled={working} onClick={() => request({ kind: "service", id: service.id, action: "restart" })} className={button}><RefreshCw className="h-3.5 w-3.5" />Restart</button></>}
        <button type="button" onClick={() => showLogs(service)} className={button}><FileText className="h-3.5 w-3.5" />Logs</button>
        <button type="button" aria-label={`Edit ${service.name}`} onClick={() => edit(service)} className={button}><Edit3 className="h-3.5 w-3.5" />Edit</button>
        <button type="button" aria-label={`Remove ${service.name}`} title={service.external ? "Move to DotCode before removing this external service." : "Stops the service, disables autostart and deletes its unit. Working data is kept."} disabled={working || service.external} onClick={() => request({ kind: "service", id: service.id, action: "remove" })} className={`${button} rt-danger`}><Trash2 aria-hidden="true" className="h-3.5 w-3.5" />Remove</button>
      </div>
    </article>)}</section>
    {!services.length && <p className="runtime-empty">{query ? "No services match your search." : "No services configured. Add a local service to get started."}</p>}
    <p className="runtime-footnote">Click Autostart to toggle it. Edit a card to view its command or change configuration. Remove stops the service, disables autostart and deletes its unit. Working data is kept. Move external services to DotCode before removing them.</p>
    {editing && <FormDialog error={error} title={editing === "new" ? "Add service" : `Edit ${editing.name}`} close={() => setEditing(null)}>
      <form onSubmit={submit} className="space-y-4">
        <label className="runtime-label">Name<input required maxLength={editing === "new" ? 64 : 100} pattern={editing === "new" ? "[a-z0-9]+(-[a-z0-9]+)*" : undefined} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className={field} placeholder="local-api" /></label>
        {editing !== "new" && <label className="runtime-label">Description<textarea maxLength={500} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} className={field} /></label>}
        {editing !== "new" && editing.shellCommand !== undefined ? <label className="runtime-label">Service command<textarea required maxLength={32000} value={draft.shellCommand} onChange={event => setDraft({ ...draft, shellCommand: event.target.value })} className={`${field} h-36 font-mono`} /></label> : canEditCommand ? <><label className="runtime-label">Executable<input required value={draft.program} onChange={event => setDraft({ ...draft, program: event.target.value })} className={field} placeholder="Executable name or /path/to/binary" /></label>
          <label className="runtime-label">Arguments, one per line<textarea value={draft.args} onChange={event => setDraft({ ...draft, args: event.target.value })} className={`${field} h-24 font-mono`} placeholder={"--host\n127.0.0.1"} /></label></> : <>
          {editing.scriptCommand && <>
            <label className="runtime-label">Service command (read-only)<textarea readOnly value={editing.scriptCommand} className={`${field} h-24 font-mono`} /></label>
          </>}
          <details open={!editing.scriptCommand}>
            <summary className="runtime-muted">Systemd launch details</summary>
            <label className="runtime-label">Systemd launch command (read-only)<textarea readOnly value={editing.command || "No launch command reported by systemd."} className={`${field} h-24 font-mono`} /></label>
            {editing.workingDirectory && <p className="runtime-muted">Systemd working directory: <code>{editing.workingDirectory}</code></p>}
          </details>
          {editing.external && editing.scriptCommand ? <div className="space-y-2"><p className="runtime-muted">Move this service into DotCode to edit its command. This restarts it if running, preserves autostart and existing credentials, and uses a DotCode-managed working folder.</p><button type="button" disabled={working} onClick={async () => { if (await request({ kind: "service-migrate", id: editing.id }) !== false) setEditing(null); }} className={`${button} rt-primary`}>Move to DotCode</button></div> : <p className="runtime-muted">This external unit is read-only. Name, description and port are dashboard metadata.</p>}
        </>}
        <label className="runtime-label">Displayed port<input required type="number" min="1024" max="65535" value={draft.port} onChange={event => setDraft({ ...draft, port: event.target.value })} className={field} /><span className="runtime-muted">To change the actual listening port, update the service arguments separately.</span></label>
        <p className="runtime-muted">{editing === "new" ? "No shell. Creates the unit only; start and autostart are separate actions." : "Saving does not restart this service. Command changes apply after the next start or restart."}</p>
        <div className="flex flex-wrap gap-2"><button disabled={working} className={`${button} rt-primary`}>{editing === "new" ? "Create service" : "Save changes"}</button>
          {editing !== "new" && !editing.external && editing.running && <button type="submit" name="restart" disabled={working} className={button}>Save and restart</button>}
        </div>
      </form>
      {editing !== "new" && <div className="runtime-edit-section"><h4>Autostart</h4><p className="runtime-muted">Currently {editing.autostart ? "enabled" : "disabled"}. {editing.autostart ? "Disabling keeps the service running." : "Enabling also starts the service."}</p>
        {editing.external && !editing.adopted ? <p className="runtime-muted">Take over controls on the card before changing autostart.</p> : <button type="button" disabled={working} onClick={async () => { if (await request({ kind: "service", id: editing.id, action: editing.autostart ? "disable" : "enable" }) !== false) setEditing(null); }} className={button}><Power className="h-3.5 w-3.5" />{editing.autostart ? "Disable autostart" : "Enable autostart"}</button>}
      </div>}
    </FormDialog>}
  </div>;
}

export function Models({ snapshot, request, working, error }: { snapshot: Snapshot; request: Request; working: boolean; error?: string }) {
  const [backend, setBackend] = useState(snapshot.backend);
  const [endpoint, setEndpoint] = useState(snapshot.endpoint || "http://127.0.0.1:8000/v1");
  const [editingBackend, setEditingBackend] = useState(false);
  const [editing, setEditing] = useState<Model | null>(null);
  const [settings, setSettings] = useState(defaultModelSettings);
  const [download, setDownload] = useState({ repo: "", remoteFile: "", fileName: "" });
  const [downloading, setDownloading] = useState(false);
  const projectors = snapshot.models.filter(model => model.projector);
  const edit = (model: Model) => { setSettings({ ...defaultModelSettings, ...model.settings }); setEditing(model); };
  return <div className="runtime-stack">
    <div className="runtime-toolbar"><div className="runtime-count"><Cpu className="h-4 w-4" />{snapshot.models.length} files <span>in DotCode storage</span></div><button type="button" onClick={() => setDownloading(true)} className={`${button} rt-primary`}><Download className="h-3.5 w-3.5" />Download GGUF</button></div>
    <section aria-labelledby="backend-title" className="runtime-panel"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 id="backend-title">Inference backend</h3><p className="runtime-muted mt-1">{snapshot.backend === "llama.cpp" ? "llama.cpp · runs your managed GGUF models" : `Custom local API · ${snapshot.endpoint}`}</p></div>
      <button type="button" aria-label="Edit inference backend" onClick={() => { setBackend(snapshot.backend); setEndpoint(snapshot.endpoint || "http://127.0.0.1:8000/v1"); setEditingBackend(true); }} className={button}><Edit3 className="h-3.5 w-3.5" />Edit</button></div>
      {snapshot.backend === "external" && <p className="runtime-muted mt-3">{snapshot.external.error ? `Endpoint check failed: ${snapshot.external.error}` : `${snapshot.external.models.length} models available from this API. API models are configured in their own server.`}</p>}
    </section>
    <div className="runtime-section-heading"><h3>Managed models</h3><span className="runtime-muted">RAM free {bytes(snapshot.hardware.ramFreeBytes)} / {bytes(snapshot.hardware.ramTotalBytes)}</span></div>
    <section aria-label="Managed models" className="runtime-card-grid">
      {snapshot.models.length === 0 && <p className="runtime-empty col-span-full">No managed models. Import an existing file or download a GGUF.</p>}
      {snapshot.models.map(model => {
        const launch = model.settings ?? defaultModelSettings;
        const running = ["starting", "running"].includes(model.status);
        return <article key={model.fileName} className={`runtime-card runtime-config-card ${model.status === "running" ? "is-live" : ""}`}>
          <div className="flex items-start justify-between gap-3"><div className="runtime-item-icon"><Cpu className="h-5 w-5" /></div><span className={`runtime-badge ${statusTone(model.status)}`}>{model.status}</span></div>
          <h3 className="mt-4 break-all">{model.fileName}</h3><p className="mt-1 text-xs">{bytes(model.sizeBytes)} · {model.projector ? "Vision projector" : "GGUF model"}</p>
          {model.projector ? <p className="runtime-muted mt-4">Select this file in a model’s Edit dialog to enable vision.</p> : <><dl className="runtime-facts"><div><dt>Port {running ? "(current)" : "(next launch)"}</dt><dd>{running ? model.port : launch.port}</dd></div><div><dt>Context (next launch)</dt><dd>{launch.contextLength}</dd></div><div><dt>GPU layers (next launch)</dt><dd>{launch.gpuLayers}</dd></div><div><dt>Projector (next launch)</dt><dd className="break-all">{launch.projector || "None"}</dd></div></dl>
            {snapshot.backend !== "llama.cpp" && !running && <p className="runtime-muted mt-3">Switch the inference backend to llama.cpp to run this file.</p>}</>}
          {model.error && <p className="mt-2 text-xs text-rose-300">{model.error}</p>}
          <div className="runtime-card-actions">
            {!model.projector && <>{running ? <button type="button" disabled={working} onClick={() => request({ kind: "model", action: "stop", fileName: model.fileName })} className={button}><Square className="h-3.5 w-3.5" />Stop</button> : <button type="button" disabled={working || snapshot.backend !== "llama.cpp"} onClick={() => request({ kind: "model", action: "start", fileName: model.fileName })} className={`${button} rt-primary`}><Play className="h-3.5 w-3.5" />Run</button>}
              <button type="button" aria-label={`Edit ${model.fileName}`} onClick={() => edit(model)} className={button}><Edit3 className="h-3.5 w-3.5" />Edit</button></>}
            <button type="button" aria-label={`Delete copy of ${model.fileName}`} disabled={working || running} onClick={() => request({ kind: "model", action: "remove", fileName: model.fileName })} className={`${button} rt-danger`}><Trash2 className="h-3.5 w-3.5" />Delete copy</button>
          </div>
          {model.logs.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs text-slate-400">Runtime log</summary><pre tabIndex={0} className="mt-2 max-h-48 overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-400">{model.logs.join("")}</pre></details>}
        </article>;
      })}
    </section>
    {snapshot.importableModels.length > 0 && <section><h3 className="mb-3 text-sm font-semibold">Available to import · ~/LOCAL-AI-MODELS</h3><div className="runtime-card-grid">{snapshot.importableModels.map(model => <article key={model.fileName} className="runtime-card runtime-config-card"><div className="flex items-center justify-between gap-3"><div className="runtime-item-icon"><Cpu className="h-5 w-5" /></div><span className="runtime-badge">Not imported</span></div><h3 className="mt-4 break-all">{model.fileName}</h3><p className="mt-1 text-xs">{bytes(model.sizeBytes)} · {model.projector ? "Vision projector" : "GGUF model"}</p><p className="runtime-muted mt-3">Import a managed copy to run and edit its settings. Original file stays unchanged.</p><div className="runtime-card-actions"><button type="button" disabled={working} onClick={() => request({ kind: "model", action: "import", fileName: model.fileName })} className={button}><Download className="h-3.5 w-3.5" />Copy in</button></div></article>)}</div></section>}
    {snapshot.backend === "external" && snapshot.external.models.length > 0 && <section><h3 className="mb-3 text-sm font-semibold">Custom API models</h3><div className="runtime-card-grid">{snapshot.external.models.map(name => <article key={name} className="runtime-card"><h3 className="break-all">{name}</h3><p className="runtime-muted mt-2">Managed by {snapshot.endpoint}. Edit in that server, not DotCode.</p></article>)}</div></section>}
    {editing && <FormDialog error={error} title={`Edit ${editing.fileName}`} close={() => setEditing(null)}><form onSubmit={async event => { event.preventDefault(); if (await request({ kind: "model", action: "configure", fileName: editing.fileName, ...settings }) !== false) setEditing(null); }} className="space-y-4">
      <p className="runtime-muted">Saved for this model only. Applies on its next launch; running processes stay unchanged.</p>
      {([["port", "Port", 1024, 65535], ["contextLength", "Context length", 512, 1048576], ["gpuLayers", "GPU layers", 0, 999]] as const).map(([key, label, min, max]) => <label key={key} className="runtime-label">{label}<input required type="number" min={min} max={max} value={settings[key]} onChange={event => setSettings({ ...settings, [key]: Number(event.target.value) })} className={field} /></label>)}
      <label className="runtime-label">Vision projector<select value={settings.projector || ""} onChange={event => setSettings({ ...settings, projector: event.target.value || undefined })} className={field}><option value="">None</option>{projectors.map(model => <option key={model.fileName}>{model.fileName}</option>)}</select></label>
      <button disabled={working} className={`${button} rt-primary`}>Save settings</button>
    </form></FormDialog>}
    {editingBackend && <FormDialog error={error} title="Edit inference backend" close={() => setEditingBackend(false)}><form onSubmit={async event => { event.preventDefault(); if (await request({ kind: "backend", backend, endpoint }) !== false) setEditingBackend(false); }} className="space-y-4">
      <label className="runtime-label">Inference backend<select value={backend} onChange={event => setBackend(event.target.value as Snapshot["backend"])} className={field}><option value="llama.cpp">llama.cpp</option><option value="external">Custom local API</option></select></label>
      {backend === "external" && <label className="runtime-label">OpenAI-compatible endpoint<input required type="url" value={endpoint} onChange={event => setEndpoint(event.target.value)} className={`${field} font-mono`} /><span className="runtime-muted">HTTP loopback IP addresses only. Include /v1 if required.</span></label>}
      <p className="runtime-muted">Does not stop existing models or change the assistant provider.</p><button disabled={working} className={`${button} rt-primary`}>Save backend</button>
    </form></FormDialog>}
    {downloading && <FormDialog error={error} title="Download GGUF" close={() => setDownloading(false)}><form onSubmit={async event => { event.preventDefault(); if (await request({ kind: "model", action: "download", ...download, fileName: download.fileName || download.remoteFile.split("/").at(-1) }) !== false) setDownloading(false); }} className="space-y-4"><label className="runtime-label">Hugging Face repository<input required value={download.repo} onChange={event => setDownload({ ...download, repo: event.target.value })} className={field} placeholder="owner/model-GGUF" /></label><label className="runtime-label">Repository file<input required value={download.remoteFile} onChange={event => setDownload({ ...download, remoteFile: event.target.value })} className={field} placeholder="model-Q4_K_M.gguf" /></label><label className="runtime-label">Local name<input value={download.fileName} onChange={event => setDownload({ ...download, fileName: event.target.value })} className={field} placeholder="Optional" /></label><button disabled={working} className={`${button} rt-primary`}>Download model</button></form></FormDialog>}
    {snapshot.downloads.map(item => <div key={item.fileName} className="runtime-card text-xs"><div className="flex justify-between gap-2"><span className="truncate">{item.fileName}</span><span>{item.status}</span></div><progress className="mt-2 w-full" value={item.receivedBytes} max={item.totalBytes || undefined} aria-label={`${item.fileName} download progress`} />{item.error && <p className="text-rose-300">{item.error}</p>}{item.status === "downloading" && <button type="button" disabled={working} onClick={() => request({ kind: "model", action: "cancel", fileName: item.fileName })} className="mt-2 text-rose-300 hover:underline">Cancel</button>}</div>)}
  </div>;
}

export function Agents({ snapshot, request, working, error }: { snapshot: Snapshot; request: Request; working: boolean; error?: string }) {
  const [category, setCategory] = useState<AgentItem["category"]>("skill");
  const [agent, setAgent] = useState<"all" | AgentItem["agent"]>("all");
  const [query, setQuery] = useState("");
  const blank = { id: "", agent: "codex" as AgentItem["agent"], category, name: "", enabled: true, description: "", content: "", transport: "http" as const, url: "", command: "", args: [] as string[] };
  const [draft, setDraft] = useState<AgentItem>(blank);
  const [argText, setArgText] = useState("");
  const [editing, setEditing] = useState(false);
  const items = useMemo(() => snapshot.agents.filter(item => item.category === category && (agent === "all" || item.agent === agent) && `${item.name} ${item.description ?? ""} ${item.url ?? ""} ${item.command ?? ""}`.toLowerCase().includes(query.toLowerCase())), [snapshot.agents, category, agent, query]);
  const edit = (item: AgentItem) => { setDraft(item); setArgText((item.args ?? []).join("\n")); setEditing(true); };
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (await request({ ...draft, kind: "agent", category, args: argText.split("\n").map(arg => arg.trim()).filter(Boolean) }) !== false) setEditing(false); };
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
  {editing && <FormDialog error={error} title={draft.id ? `Edit ${draft.name}` : `Add ${categoryName}`} close={() => setEditing(false)}><form onSubmit={submit} className="space-y-4">
    <label className="runtime-label">Agent<select disabled={Boolean(draft.id)} value={draft.agent} onChange={event => setDraft({ ...draft, agent: event.target.value as AgentItem["agent"] })} className={`${field} mt-1`}><option value="codex">Codex</option><option value="claude">Claude Code</option></select></label>
    <label className="runtime-label">Name<input required readOnly={Boolean(draft.id)} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className={`${field} mt-1`} placeholder="review-code" /></label>
    {category === "mcp" ? <><fieldset><legend className="text-xs text-slate-400">Transport</legend><div className="mt-1 grid grid-cols-2 gap-2">{(["http", "stdio"] as const).map(value => <label key={value} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs"><input type="radio" name="transport" checked={draft.transport === value} onChange={() => setDraft({ ...draft, transport: value })} />{value === "http" ? "HTTP URL" : "Local command"}</label>)}</div></fieldset>
      {draft.transport === "http" ? <label className="runtime-label">Server URL<input required type="url" value={draft.url ?? ""} onChange={event => setDraft({ ...draft, url: event.target.value })} className={`${field} mt-1`} placeholder="https://example.com/mcp" /></label> : <><label className="runtime-label">Command<input required value={draft.command ?? ""} onChange={event => setDraft({ ...draft, command: event.target.value })} className={`${field} mt-1`} placeholder="npx" /></label><label className="runtime-label">Arguments, one per line<textarea value={argText} onChange={event => setArgText(event.target.value)} className={`${field} mt-1 h-24 font-mono`} /></label></>}
      <p className="text-xs text-amber-300/80">Do not enter secrets. Configure credentials outside DotCode.</p></> : <><label className="runtime-label">{category === "skill" ? "When to use" : "Section title"}<input required maxLength={500} value={draft.description ?? ""} onChange={event => setDraft({ ...draft, description: event.target.value })} className={`${field} mt-1`} placeholder={category === "skill" ? "Use when reviewing code changes" : "Code style"} /></label><label className="runtime-label">{category === "skill" ? "Steps" : "Instruction"}<textarea required value={draft.content ?? ""} onChange={event => setDraft({ ...draft, content: event.target.value })} className={`${field} mt-1 h-40`} placeholder={category === "skill" ? "1. Inspect the diff.\n2. Report correctness risks." : "Prefer small, tested changes."} /></label></>}
    <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />Apply to this agent</label>
    <button disabled={working} className={`${button} rt-primary`}><Box className="h-3.5 w-3.5" />Save configuration</button>
    <p className="text-xs text-slate-500">Approval shows exact files before saving.</p>
  </form></FormDialog>}</div>;
}
