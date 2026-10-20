import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Send,
  X,
  Copy,
  Check,
  Cpu,
  Terminal,
  BookOpen,
  ArrowRight,
  Maximize2,
  Minimize2,
  Play,
  Square,
  Github,
  Globe,
  Eraser,
  FolderOpen,
  Folder,
  ArrowUp,
  Home,
  ChevronDown,
} from "lucide-react";
import { ManageableItem } from "../data/items";
import { readApiJson } from "../useCatalog";

const urlPattern = /(https?:\/\/[^\s<>"'`]*[^\s<>"'`.,;:!?)\]])/gi;
const chatLinkPattern = /(\[[^\]\n]+\]\(https?:\/\/[^\s<>"'`)]+\)|https?:\/\/[^\s<>"'`]*[^\s<>"'`.,;:!?)\]])/gi;

const renderLinks = (text: string, linked: boolean, keyPrefix = "") => text.split(linked ? chatLinkPattern : urlPattern).map((part, index) => {
  if (index % 2 === 0) return part;
  if (!linked) return <span key={`${keyPrefix}${index}`} className="text-sky-300">{part}</span>;
  const markdown = /^\[([^\]\n]+)\]\((https?:\/\/[^\s<>"'`)]+)\)$/i.exec(part);
  const href = markdown?.[2] ?? part;
  return (
    <a key={`${keyPrefix}${index}`} href={href} target="_blank" rel="noopener noreferrer" className="[overflow-wrap:anywhere] rounded-sm bg-slate-950/40 px-0.5 text-sky-300 underline decoration-sky-300/50 underline-offset-2 hover:bg-slate-950/60 focus-visible:outline-2 focus-visible:outline-sky-300">
      {/^https?:\/\/github\.com(?:[/?#]|$)/i.test(href) ? <Github aria-hidden="true" className="mr-1 inline h-3 w-3" /> : <Globe aria-hidden="true" className="mr-1 inline h-3 w-3" />}{href}
    </a>
  );
});

const renderInline = (text: string, key: string) => text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, index) => {
  if (index % 2 === 0) return renderLinks(part, true, `${key}-${index}-`);
  if (part.startsWith("`")) {
    const code = part.slice(1, -1);
    return <code key={`${key}-${index}`} tabIndex={code.length > 120 ? 0 : undefined} className={code.length > 120
      ? "my-2 block max-h-64 max-w-full overflow-auto whitespace-pre rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-[11px] leading-5 text-amber-200 focus-visible:outline-2 focus-visible:outline-sky-300"
      : "rounded bg-slate-950/70 px-1 py-0.5 font-mono text-[0.92em] text-amber-200 [overflow-wrap:anywhere]"}>{code}</code>;
  }
  return <strong key={`${key}-${index}`} className="font-semibold text-slate-50">{renderLinks(part.slice(2, -2), true, `${key}-${index}-`)}</strong>;
});

// ponytail: chat Markdown subset; use a parser when tables, nesting, or HTML-like Markdown are needed.
const renderMarkdown = (text: string) => {
  const lines = text.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  const isList = (line: string) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
  const isBlock = (line: string) => /^\s*```/.test(line) || /^#{1,6}\s+/.test(line) || isList(line);
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    if (/^\s*```/.test(line)) {
      const code = [];
      for (index++; index < lines.length && !/^\s*```\s*$/.test(lines[index]); index++) code.push(lines[index]);
      index++;
      blocks.push(<pre key={blocks.length} tabIndex={0} aria-label="Code block" className="max-h-72 max-w-full overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-3 text-[11px] leading-5 text-slate-200 focus-visible:outline-2 focus-visible:outline-sky-300"><code className="whitespace-pre font-mono">{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push(<h3 key={blocks.length} className="text-[13px] font-semibold text-slate-50">{renderInline(heading[1], `h${blocks.length}`)}</h3>);
      index++;
      continue;
    }
    const ordered = /^\s*\d+[.)]\s+/.test(line);
    if (isList(line)) {
      const items: string[] = [];
      while (index < lines.length && ((isList(lines[index]) && /^\s*\d+[.)]\s+/.test(lines[index]) === ordered) || (items.length > 0 && !isList(lines[index]) && /^\s{2,}\S/.test(lines[index])))) {
        if (isList(lines[index])) items.push(lines[index].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""));
        else items[items.length - 1] += `\n${lines[index].trim()}`;
        index++;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={blocks.length} className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5 marker:text-slate-500`}>{items.map((item, itemIndex) => <li key={itemIndex} className="whitespace-pre-wrap pl-0.5">{renderInline(item, `l${blocks.length}-${itemIndex}`)}</li>)}</List>);
      continue;
    }
    const paragraph = [];
    while (index < lines.length && lines[index].trim() && (!paragraph.length || !isBlock(lines[index]))) paragraph.push(lines[index++]);
    blocks.push(<p key={blocks.length} className="whitespace-pre-wrap">{renderInline(paragraph.join("\n"), `p${blocks.length}`)}</p>);
  }
  return blocks;
};

export const renderChatText = (text: string, linked: boolean) => linked ? renderMarkdown(text) : renderLinks(text, false);

interface Message {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: string;
  planId?: string;
  steps?: Step[];
  duration?: string;
}

interface Step {
  id: string;
  label: string;
  output?: string;
}

interface AiPaneProps {
  isOpen: boolean;
  onClose: () => void;
  items: ManageableItem[];
  prefilledPrompt?: string;
  submittedPrompt?: string;
  onClearSubmittedPrompt: () => void;
  onClearPrefilledPrompt?: () => void;
  onInventoryChanged: () => void;
}

export const AiPane: React.FC<AiPaneProps> = ({
  isOpen,
  onClose,
  items,
  prefilledPrompt,
  submittedPrompt,
  onClearSubmittedPrompt,
  onClearPrefilledPrompt,
  onInventoryChanged,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "initial-welcome",
      role: "model",
      text: "Ask me to add, edit, or remove cards, or install, update, or uninstall tools. Card changes save automatically. Installation changes need an approved plan.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [workspace, setWorkspace] = useState("");
  const [folders, setFolders] = useState<{ dir: string; parent: string; home: string; entries: string[] } | null>(null);
  const [folderError, setFolderError] = useState("");
  const [folderLoading, setFolderLoading] = useState(false);
  const folderDialog = useRef<HTMLDialogElement>(null);
  const folderButton = useRef<HTMLButtonElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const controllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const installedCount = items.filter((i) => i.installed).length;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let saved = "";
        try { saved = localStorage.getItem("dotcode_codex_workspace") || ""; } catch {}
        const data = await readApiJson(await fetch("/api/workspace", { headers: saved ? { "x-dotcode-workspace": saved } : {} }));
        if (!cancelled) {
          setWorkspace(data.workspace);
        }
      } catch (error) {
        if (!cancelled) setFolderError(error instanceof Error ? error.message : "Codex folder unavailable.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const browseFolder = async (dir: string) => {
    setFolderLoading(true);
    setFolderError("");
    try {
      setFolders(await readApiJson(await fetch(`/api/folders?dir=${encodeURIComponent(dir)}`)));
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "Folders unavailable.");
    } finally { setFolderLoading(false); }
  };

  const selectFolder = async () => {
    if (isLoading || folderLoading || !folders) return;
    setFolderLoading(true);
    setFolderError("");
    try {
      const data = await readApiJson(await fetch("/api/workspace", { headers: { "x-dotcode-workspace": folders.dir } }));
      localStorage.setItem("dotcode_codex_workspace", data.workspace);
      setWorkspace(data.workspace);
      setMessages(previous => previous.map(message => ({ ...message, planId: undefined })));
      folderDialog.current?.close();
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "Codex folder unavailable.");
    } finally { setFolderLoading(false); }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages]);

  // Handle incoming prefilled prompt from "Ask AI about this tool" buttons
  useEffect(() => {
    if (prefilledPrompt) {
      setInput(prefilledPrompt);
      if (onClearPrefilledPrompt) {
        onClearPrefilledPrompt();
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [prefilledPrompt]);

  useEffect(() => {
    if (!isLoading) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isLoading]);

  const elapsed = (from: number, to = Date.now()) => {
    const seconds = Math.max(0, Math.round((to - from) / 1000));
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  const addModelMessage = (text: string, planId?: string, steps?: Step[], duration?: string) => {
    setMessages((previous) => [...previous, {
      id: `model-${crypto.randomUUID()}`,
      role: "model",
      text,
      planId,
      steps,
      duration,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }]);
  };

  const runAgent = async (body: { mode: "plan"; message: string; history: { role: Message["role"]; text: string }[] } | { mode: "execute"; planId: string }) => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    setSteps([]);
    let runSteps: Step[] = [];
    const started = Date.now();
    setStartedAt(started);
    setNow(started);
    const finish = (text: string, planId?: string, finalMessageId?: string) => addModelMessage(text, planId, runSteps.filter(step => step.id !== finalMessageId), elapsed(started));
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-dotcode-workspace": workspace },
        body: JSON.stringify({ ...body, ...(body.mode === "plan" ? { catalog: items.map(({ githubUrl, name, description, category }) => ({ githubUrl, name, description, category })) } : {}) }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Server returned ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let terminal = false;
      const receive = (event: { type: string; reply?: string; planId?: string; finalMessageId?: string; message?: string; item?: { id: string; type: string; status?: string; exit_code?: number; command?: string; aggregated_output?: string; text?: string; query?: string; message?: string; server?: string; tool?: string; changes?: { kind: string; path: string }[]; items?: { text: string; completed: boolean }[] } }) => {
        if (event.type === "result") {
          terminal = true;
          finish(event.reply || "No response.", event.planId, event.finalMessageId);
          onInventoryChanged();
        } else if (event.type === "error") {
          terminal = true;
          finish(`Error: ${event.message}`);
          if (body.mode === "execute") onInventoryChanged();
        } else if (event.type === "notice" && event.message) {
          runSteps = [...runSteps, { id: `notice-${runSteps.length}`, label: event.message }];
          setSteps(runSteps);
        } else if (event.item && event.type.startsWith("item.")) {
          const item = event.item;
          if (item.type === "agent_message" && (!item.text?.trim() || /^[{[]/.test(item.text.trim()))) return;
          const state = item.status === "in_progress" || event.type === "item.started" ? "Running" : item.status === "failed" || (item.exit_code ?? 0) !== 0 ? "Failed" : "Ran";
          const step: Step = {
            id: item.id,
            label: item.type === "command_execution" ? `${state} ${item.command}`
              : item.type === "reasoning" || item.type === "agent_message" ? item.text || "Thinking"
              : item.type === "web_search" ? `Searched ${item.query}`
              : item.type === "mcp_tool_call" ? `${state} ${item.server}.${item.tool}`
              : item.type === "file_change" ? `Changed ${item.changes?.map(change => `${change.kind} ${change.path}`).join(", ")}`
              : item.type === "todo_list" ? item.items?.map(todo => `${todo.completed ? "[done]" : "[todo]"} ${todo.text}`).join("\n") || "Updated plan"
              : item.message || item.type,
            output: item.aggregated_output?.slice(-4000),
          };
          runSteps = runSteps.some(previous => previous.id === step.id)
            ? runSteps.map(previous => previous.id === step.id ? step : previous)
            : [...runSteps, step];
          setSteps(runSteps);
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) if (line.trim()) receive(JSON.parse(line));
        if (done) break;
      }
      if (buffer.trim()) receive(JSON.parse(buffer));
      if (!terminal) throw new Error("Connection ended before Codex completed.");
    } catch (err) {
      const stopped = err instanceof DOMException && err.name === "AbortError";
      finish(`Error: ${stopped ? "Stopped. Commands may have partially changed the machine; inspect before retrying." : err instanceof Error ? err.message : "Unknown error"}`);
      if (body.mode === "execute") onInventoryChanged();
    } finally {
      controllerRef.current = null;
      setIsLoading(false);
    }
  };

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isLoading || !workspace || folderLoading) return;
    const history = messages.slice(-10).map(({ role, text }) => ({ role, text }));
    setMessages((prev) => [...prev, {
      id: `user-${crypto.randomUUID()}`,
      role: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }]);
    if (!textToSend) setInput("");
    await runAgent({ mode: "plan", message: query, history });
  };

  useEffect(() => {
    if (submittedPrompt && !isLoading) {
      onClearSubmittedPrompt();
      void handleSend(submittedPrompt);
    }
  }, [submittedPrompt, isLoading]);

  const approvePlan = async (planId: string) => {
    if (isLoading || !confirm("Run this plan on your machine? Commands may install, change, or remove software.")) return;
    setMessages((previous) => previous.map((message) => message.planId === planId ? { ...message, planId: undefined } : message));
    await runAgent({ mode: "execute", planId });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => addModelMessage("Error: Clipboard access failed."));
  };

  const clearChat = () => setMessages([{
    id: "cleared-welcome", role: "model", text: "Chat cleared. Paste a GitHub link and say what to do.",
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }]);

  if (!isOpen) return null;

  return (
    <aside
      onDragOver={event => {
        if (event.dataTransfer.types.some(type => ["text/uri-list", "text/plain"].includes(type))) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setIsDragging(true);
        }
      }}
      onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
      }}
      onDrop={event => {
        event.preventDefault();
        setIsDragging(false);
        const text = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
        const urls = text.split(/\s+/).filter(url => /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(url));
        if (!urls.length) return;
        setInput(previous => [previous.trimEnd(), ...new Set(urls)].filter(Boolean).join("\n"));
        inputRef.current?.focus();
      }}
      className={`fixed inset-y-0 right-0 z-40 flex flex-col border-l border-slate-800 bg-slate-900/95 backdrop-blur-xl transition-all duration-200 shadow-2xl ${
        isExpanded ? "w-full md:w-[620px]" : "w-full sm:w-[420px] lg:w-[460px]"
      }`}
    >
      {isDragging && <div role="status" className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-indigo-400 bg-slate-950/90 text-sm text-indigo-200">Drop GitHub items to add them to your message</div>}
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-950/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100">DotCode Copilot</h2>
              <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                Codex
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {installedCount} verified · {items.length} tracked
            </p>
            <button ref={folderButton} type="button" aria-label="Codex target folder" aria-haspopup="dialog" disabled={isLoading || folderLoading} title={workspace || "Choose Codex working folder"} onClick={() => {
              folderDialog.current?.showModal();
              void browseFolder(workspace || "~/");
            }} className="mt-1 flex w-fit max-w-48 cursor-pointer items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:opacity-40">
                <FolderOpen aria-hidden="true" className="h-3 w-3 shrink-0" />
                <span className="truncate">{workspace.split("/").filter(Boolean).pop() || "Target folder"}</span>
                <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0" />
            </button>
            <dialog ref={folderDialog} aria-labelledby="codex-folder-title" onClose={() => folderButton.current?.focus()} className="fixed inset-0 m-auto max-h-[85dvh] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-4 text-slate-100 shadow-2xl backdrop:bg-black/60">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="codex-folder-title" className="text-sm font-semibold">Choose target folder</h2>
                  <button type="button" autoFocus aria-label="Close folder picker" onClick={() => folderDialog.current?.close()} className="rounded p-1 text-slate-400 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-300"><X aria-hidden="true" className="h-4 w-4" /></button>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Parent folder" disabled={folderLoading || !folders || folders.parent === folders.dir} onClick={() => folders && void browseFolder(folders.parent)} className="rounded p-1 text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:opacity-40"><ArrowUp aria-hidden="true" className="h-4 w-4" /></button>
                  <button type="button" aria-label="Home folder" disabled={folderLoading} onClick={() => void browseFolder(folders?.home || "~/")} className="rounded p-1 text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:opacity-40"><Home aria-hidden="true" className="h-4 w-4" /></button>
                  <p aria-live="polite" className="min-w-0 break-all font-mono text-[11px] text-slate-400">{folders?.dir || workspace}</p>
                </div>
                <div aria-label="Subfolders" aria-busy={folderLoading} className="max-h-[40dvh] min-h-24 overflow-y-auto rounded border border-slate-800 p-1">
                  {folderLoading ? <p role="status" className="p-2 text-xs text-slate-400">Loading folders...</p> : folders?.entries.map(name => (
                    <button type="button" key={name} onClick={() => void browseFolder(`${folders.dir}/${name}`)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-300">
                      <Folder aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" /><span className="break-all">{name}</span>
                    </button>
                  ))}
                  {!folderLoading && folders?.entries.length === 0 && <p className="p-2 text-xs text-slate-400">No subfolders</p>}
                </div>
                <p className="text-[11px] text-slate-500">Changes only where Codex works. The saved catalog stays in DotCode data.</p>
                {folderError && <p role="alert" className="break-words text-xs text-rose-300">{folderError}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => folderDialog.current?.close()} className="rounded px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-300">Cancel</button>
                  <button type="button" onClick={() => void selectFolder()} disabled={isLoading || folderLoading || !folders || !!folderError} className="rounded bg-indigo-600 px-3 py-2 text-xs text-white focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:opacity-50">Use this folder</button>
                </div>
              </div>
            </dialog>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button type="button" onClick={clearChat} disabled={isLoading} aria-label="Clear conversation" title="Clear conversation" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-40">
            <Eraser aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "Standard width" : "Expand width"}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={onClose}
            title="Close AI pane"
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            <div className="flex items-center gap-1.5 mb-1 px-1">
              <span className="text-[11px] font-medium text-slate-400">
                {msg.role === "user" ? "You" : "DotCode AI"}
              </span>
              <span className="text-[10px] text-slate-600">· {msg.timestamp}</span>
            </div>

            {msg.duration && (
              <details className="mb-1.5 max-w-[92%] px-1 text-[11px] text-slate-500">
                <summary className="cursor-pointer hover:text-slate-300">Worked for {msg.duration}{msg.steps?.length ? ` · ${msg.steps.length} steps` : ""}</summary>
                <div className="mt-1 space-y-0.5 border-l border-slate-700 pl-2">
                  {msg.steps?.length ? msg.steps.map((step) => step.output ? (
                    <details key={step.id}><summary className="cursor-pointer whitespace-pre-wrap break-all">• {step.label}</summary><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-950 p-2 text-[10px] text-slate-400">{step.output}</pre></details>
                  ) : <div key={step.id} className="whitespace-pre-wrap break-all">• {step.label}</div>) : <div>No intermediate steps.</div>}
                </div>
              </details>
            )}

            <div
              className={`relative group min-w-0 max-w-[92%] rounded-xl px-3.5 py-2.5 text-xs sm:text-[13px] leading-relaxed shadow-sm ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-tr-none"
                  : "bg-slate-800/90 border border-slate-700/60 text-slate-200 rounded-tl-none"
              }`}
            >
              {msg.duration && <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">{msg.text.startsWith("Error:") ? "Error" : "Final answer"}</div>}
              <div className="min-w-0 space-y-2 break-words">
                {renderChatText(msg.text, true)}
              </div>
              {msg.planId && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => msg.planId && approvePlan(msg.planId)}
                  className="mt-3 flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  <Play className="h-3 w-3" />
                  Approve and run on this machine
                </button>
              )}

              {msg.role === "model" && (
                <button
                  onClick={() => copyToClipboard(msg.text, msg.id)}
                  title="Copy response"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded bg-slate-700/80 hover:bg-slate-600 text-slate-300 transition-opacity"
                >
                  {copiedId === msg.id ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-1.5 mb-1 px-1">
              <span className="text-[11px] font-medium text-slate-400">DotCode AI</span>
              <span className="text-[10px] text-slate-600">· working {elapsed(startedAt, now)}</span>
            </div>
            <div className="rounded-xl rounded-tl-none border border-slate-700/60 bg-slate-800/90 px-4 py-3 text-xs text-slate-300 flex items-center gap-2">
              <div className="flex space-x-1">
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.3s]"></div>
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.15s]"></div>
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400"></div>
              </div>
              <span className="text-slate-400 text-xs">{steps.at(-1)?.label || "Codex is inspecting..."}</span>
            </div>
            {steps.length > 0 && <details className="mt-2 max-w-full text-[11px] text-slate-500"><summary className="cursor-pointer">Show {steps.length} steps</summary>{steps.map((step) => step.output ? (
              <details key={step.id}><summary className="cursor-pointer whitespace-pre-wrap break-all">• {step.label}</summary><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-950 p-2 text-[10px] text-slate-400">{step.output}</pre></details>
            ) : <div key={step.id} className="whitespace-pre-wrap break-all">• {step.label}</div>)}</details>}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input container */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/70">
        <div className="relative rounded-xl border border-slate-700/80 bg-slate-900/90 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all shadow-inner">
          {/* ponytail: highlight-only overlay; inline icons in the editor need contenteditable. */}
          <div ref={highlightRef} aria-hidden="true" className="font-['Lilex_Nerd_Font',monospace] pointer-events-none absolute inset-x-0 top-0 h-[60px] overflow-hidden whitespace-pre-wrap break-words px-3.5 py-2.5 text-xs sm:text-[13px] text-slate-100">
            {renderChatText(input, false)}{"\n"}
          </div>
          <textarea
            ref={inputRef}
            onScroll={(e) => { if (highlightRef.current) highlightRef.current.scrollTop = e.currentTarget.scrollTop; }}
            aria-label="Message Codex"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add, edit, remove, install, update, or uninstall"
            rows={2}
            className="font-['Lilex_Nerd_Font',monospace] relative block h-[60px] w-full resize-none break-words bg-transparent px-3.5 py-2.5 text-xs sm:text-[13px] text-transparent caret-slate-100 placeholder-slate-500 [scrollbar-width:none] focus:outline-none"
          />
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-800/50 bg-slate-950/40">
            <span className="text-[10px] text-slate-500">
              Press <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">Enter</kbd> to send
            </span>
            <div className="flex items-center gap-2">
              {isLoading && <button type="button" onClick={() => controllerRef.current?.abort()} className="flex items-center gap-1 rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300"><Square className="h-3 w-3" />Stop</button>}
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading || !workspace || folderLoading}
                className="flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span>Plan</span>
                <Send className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
