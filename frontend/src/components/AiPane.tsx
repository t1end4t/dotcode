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
} from "lucide-react";
import { ManageableItem } from "../data/items";
import { readApiJson } from "../useCatalog";

const urlPattern = /(https?:\/\/[^\s<>"'`]*[^\s<>"'`.,;:!?)\]])/gi;
const chatLinkPattern = /(\[[^\]\n]+\]\(https?:\/\/[^\s<>"'`)]+\)|https?:\/\/[^\s<>"'`]*[^\s<>"'`.,;:!?)\]])/gi;

const renderLinks = (text: string, linked: boolean, keyPrefix = "") => text.split(linked ? chatLinkPattern : urlPattern).map((part, index) => {
  if (index % 2 === 0) return part;
  if (!linked) return <span key={`${keyPrefix}${index}`} className="text-(--ctp-sky)">{part}</span>;
  const markdown = /^\[([^\]\n]+)\]\((https?:\/\/[^\s<>"'`)]+)\)$/i.exec(part);
  const href = markdown?.[2] ?? part;
  return (
    <a key={`${keyPrefix}${index}`} href={href} target="_blank" rel="noopener noreferrer" className="[overflow-wrap:anywhere] rounded-sm bg-(--ctp-mantle)/40 px-0.5 text-(--ctp-sky) underline decoration-(--ctp-sky)/50 underline-offset-2 hover:bg-(--ctp-mantle)/60 focus-visible:outline-2 focus-visible:outline-(--ctp-sky)">
      {/^https?:\/\/github\.com(?:[/?#]|$)/i.test(href) ? <Github aria-hidden="true" className="mr-1 inline h-3 w-3" /> : <Globe aria-hidden="true" className="mr-1 inline h-3 w-3" />}{href}
    </a>
  );
});

const renderInline = (text: string, key: string) => text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, index) => {
  if (index % 2 === 0) return renderLinks(part, true, `${key}-${index}-`);
  if (part.startsWith("`")) {
    const code = part.slice(1, -1);
    return <code key={`${key}-${index}`} tabIndex={code.length > 120 ? 0 : undefined} className={code.length > 120
      ? "my-2 block max-h-64 max-w-full overflow-auto whitespace-pre rounded-lg border border-(--ctp-surface1) bg-(--ctp-mantle) p-3 font-mono text-[11px] leading-5 text-(--ctp-yellow) focus-visible:outline-2 focus-visible:outline-(--ctp-sky)"
      : "rounded bg-(--ctp-mantle)/70 px-1 py-0.5 font-mono text-[0.92em] text-(--ctp-yellow) [overflow-wrap:anywhere]"}>{code}</code>;
  }
  return <strong key={`${key}-${index}`} className="font-semibold text-(--ctp-text)">{renderLinks(part.slice(2, -2), true, `${key}-${index}-`)}</strong>;
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
      blocks.push(<pre key={blocks.length} tabIndex={0} aria-label="Code block" className="max-h-72 max-w-full overflow-auto rounded-lg border border-(--ctp-surface1) bg-(--ctp-mantle) p-3 text-[11px] leading-5 text-(--ctp-text) focus-visible:outline-2 focus-visible:outline-(--ctp-sky)"><code className="whitespace-pre font-mono">{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push(<h3 key={blocks.length} className="text-[13px] font-semibold text-(--ctp-text)">{renderInline(heading[1], `h${blocks.length}`)}</h3>);
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
      blocks.push(<List key={blocks.length} className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5 marker:text-(--ctp-overlay2)`}>{items.map((item, itemIndex) => <li key={itemIndex} className="whitespace-pre-wrap pl-0.5">{renderInline(item, `l${blocks.length}-${itemIndex}`)}</li>)}</List>);
      continue;
    }
    const paragraph = [];
    while (index < lines.length && lines[index].trim() && (!paragraph.length || !isBlock(lines[index]))) paragraph.push(lines[index++]);
    blocks.push(<p key={blocks.length} className="whitespace-pre-wrap">{renderInline(paragraph.join("\n"), `p${blocks.length}`)}</p>);
  }
  return blocks;
};

export const renderChatText = (text: string, linked: boolean) => linked ? renderMarkdown(text) : renderLinks(text, false);

// ponytail: unwrap known shell quotes for display only; leave other forms raw until a shell parser is needed.
export const formatToolCommand = (command: string) => {
  const match = /^(?:\S*\/)?(?:ba|z)?sh\s+-l?c\s+(?:'((?:[^']|'"'"'|'\\'')*)'|"([^"\\]*)")$/.exec(command.trim());
  if (!match) return command;
  const script = (match[1] ?? match[2]).replace(/'"'"'|'\\''/g, "'");
  return script.replace(/\s+/g, " ").trim() || command;
};

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
  command?: string;
  failed?: boolean;
  output?: string;
}

export const ToolSteps = ({ steps }: { steps: Step[] }) => (
  <ol aria-label="Tool activity" className="w-full min-w-0 max-w-full space-y-0.5 font-mono text-[11px] leading-5">
    {steps.map((step) => {
      const row = (
        <>
          <span aria-hidden="true" className="shrink-0">•</span>
          <span className="min-w-0 truncate">{step.label}</span>
        </>
      );
      const rowClass = `flex min-w-0 items-center gap-1.5 rounded px-1 ${step.failed ? "text-(--ctp-red)" : "text-(--ctp-overlay2)"}`;
      return (
        <li key={step.id} className="min-w-0">
          {step.command || step.output || step.label.length > 80 || step.label.includes("\n") ? (
            <details>
              <summary title={step.label} className={`${rowClass} cursor-pointer hover:bg-(--ctp-surface0)/60 focus-visible:outline-2 focus-visible:outline-(--ctp-sky)`}>{row}</summary>
              <div className="ml-3 mt-1 space-y-1 border-l border-(--ctp-surface1) pl-2">
                {step.command
                  ? <pre tabIndex={0} aria-label="Full command" className="max-h-32 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded bg-(--ctp-mantle) p-2 text-(--ctp-subtext1) focus-visible:outline-2 focus-visible:outline-(--ctp-sky)">{step.command}</pre>
                  : <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-(--ctp-subtext0)">{step.label}</p>}
                {step.output && <pre tabIndex={0} aria-label="Command output" className="max-h-48 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded bg-(--ctp-mantle) p-2 text-[10px] text-(--ctp-subtext0) focus-visible:outline-2 focus-visible:outline-(--ctp-sky)">{step.output}</pre>}
              </div>
            </details>
          ) : <div title={step.label} className={rowClass}>{row}</div>}
        </li>
      );
    })}
  </ol>
);

interface AiPaneProps {
  isOpen: boolean;
  onClose: () => void;
  items: ManageableItem[];
  prefilledPrompt?: string;
  submittedPrompt?: string;
  onClearSubmittedPrompt: () => void;
  onClearPrefilledPrompt?: () => void;
  onInventoryChanged: () => void;
  workspace?: string;
  onBusyChange?: (busy: boolean) => void;
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
  workspace = "",
  onBusyChange,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "initial-welcome",
      role: "model",
      text: "Ask me to manage cards or install, update, or uninstall tools in the target folder. No separate installation plan approval. I stop for privileges or security-sensitive changes; desktop integration still needs approval.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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

  useEffect(() => { setMessages(previous => previous.map(message => ({ ...message, planId: undefined }))); }, [workspace]);
  useEffect(() => { onBusyChange?.(isLoading); }, [isLoading, onBusyChange]);

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

  const runAgent = async (body: { mode: "chat"; message: string; history: { role: Message["role"]; text: string }[] } | { mode: "execute"; planId: string }) => {
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
        body: JSON.stringify({ ...body, ...(body.mode === "chat" ? { catalog: items.map(({ githubUrl, name, description, category }) => ({ githubUrl, name, description, category })) } : {}) }),
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
          onInventoryChanged();
        } else if (event.type === "notice" && event.message) {
          runSteps = [...runSteps, { id: `notice-${runSteps.length}`, label: event.message }];
          setSteps(runSteps);
        } else if (event.item && event.type.startsWith("item.")) {
          const item = event.item;
          if (item.type === "agent_message" && (!item.text?.trim() || /^[{[]/.test(item.text.trim()))) return;
          const state = item.status === "in_progress" || event.type === "item.started" ? "Running" : item.status === "failed" || (item.exit_code ?? 0) !== 0 ? "Failed" : "Ran";
          const step: Step = {
            id: item.id,
            label: item.type === "command_execution" ? `${state} ${formatToolCommand(item.command ?? "")}`
              : item.type === "reasoning" || item.type === "agent_message" ? item.text || "Thinking"
              : item.type === "web_search" ? `Searched ${item.query}`
              : item.type === "mcp_tool_call" ? `${state} ${item.server}.${item.tool}`
              : item.type === "file_change" ? `Changed ${item.changes?.map(change => `${change.kind} ${change.path}`).join(", ")}`
              : item.type === "todo_list" ? item.items?.map(todo => `${todo.completed ? "[done]" : "[todo]"} ${todo.text}`).join("\n") || "Updated plan"
              : item.message || item.type,
            command: item.type === "command_execution" ? item.command : undefined,
            failed: state === "Failed",
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
      onInventoryChanged();
    } finally {
      controllerRef.current = null;
      setIsLoading(false);
    }
  };

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isLoading || !workspace) return;
    const history = messages.slice(-10).map(({ role, text }) => ({ role, text }));
    setMessages((prev) => [...prev, {
      id: `user-${crypto.randomUUID()}`,
      role: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }]);
    if (!textToSend) setInput("");
    await runAgent({ mode: "chat", message: query, history });
  };

  useEffect(() => {
    if (submittedPrompt && !isLoading) {
      onClearSubmittedPrompt();
      void handleSend(submittedPrompt);
    }
  }, [submittedPrompt, isLoading]);

  const approvePlan = async (planId: string) => {
    if (isLoading || !confirm("Apply the desktop integration changes shown? This changes launcher files outside the target folder.")) return;
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
      id="assistant-pane"
      aria-labelledby="assistant-pane-title"
      onKeyDown={event => {
        if (event.key === "Escape") onClose();
      }}
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
      className={`absolute inset-y-0 right-0 z-40 flex flex-col border-l border-(--ctp-surface0) bg-(--ctp-base)/95 backdrop-blur-xl transition-all duration-200 shadow-2xl lg:relative lg:z-auto lg:shrink-0 ${
        isExpanded ? "w-full md:w-[620px]" : "w-full sm:w-[420px] lg:w-[460px]"
      }`}
    >
      {isDragging && <div role="status" className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-(--ctp-mauve) bg-(--ctp-mantle)/90 text-sm text-(--ctp-lavender)">Drop GitHub items to add them to your message</div>}
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-(--ctp-surface0)/80 bg-(--ctp-mantle)/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--ctp-mauve)/10 border border-(--ctp-mauve)/20 text-(--ctp-mauve)">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 id="assistant-pane-title" className="text-sm font-semibold text-(--ctp-text)">DotCode Copilot</h2>
              <span className="text-[10px] font-mono uppercase tracking-wider text-(--ctp-mauve) bg-(--ctp-mauve)/10 px-1.5 py-0.5 rounded border border-(--ctp-mauve)/20">
                Codex
              </span>
            </div>
            <p className="text-xs text-(--ctp-subtext0)">
              {installedCount} verified · {items.length} tracked
            </p>

          </div>
        </div>

        <div className="flex items-center gap-1">
          <button type="button" onClick={clearChat} disabled={isLoading} aria-label="Clear conversation" title="Clear conversation" className="rounded-md p-1.5 text-(--ctp-subtext0) hover:bg-(--ctp-surface0) hover:text-(--ctp-text) focus-visible:ring-2 focus-visible:ring-(--ctp-mauve) disabled:opacity-40">
            <Eraser aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label="Expand assistant"
            aria-pressed={isExpanded}
            title={isExpanded ? "Standard width" : "Expand width"}
            className="p-1.5 text-(--ctp-subtext0) hover:text-(--ctp-text) hover:bg-(--ctp-surface0) rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-(--ctp-mauve)"
          >
            {isExpanded ? <Minimize2 aria-hidden="true" className="h-4 w-4" /> : <Maximize2 aria-hidden="true" className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close assistant"
            title="Close assistant"
            className="p-1.5 text-(--ctp-subtext0) hover:text-(--ctp-text) hover:bg-(--ctp-surface0) rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-(--ctp-mauve)"
          >
            <X aria-hidden="true" className="h-4 w-4" />
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
              <span className="text-[11px] font-medium text-(--ctp-subtext0)">
                {msg.role === "user" ? "You" : "DotCode AI"}
              </span>
              <span className="text-[10px] text-(--ctp-overlay1)">· {msg.timestamp}</span>
            </div>

            {msg.duration && (
              <details className="mb-1.5 max-w-[92%] px-1 text-[11px] text-(--ctp-overlay2)">
                <summary className="cursor-pointer hover:text-(--ctp-subtext1)">Worked for {msg.duration}{msg.steps?.length ? ` · ${msg.steps.length} steps` : ""}</summary>
                <div className="mt-1">
                  {msg.steps?.length ? <ToolSteps steps={msg.steps} /> : <div>No intermediate steps.</div>}
                </div>
              </details>
            )}

            <div
              className={`relative group min-w-0 max-w-[92%] rounded-xl px-3.5 py-2.5 text-xs sm:text-[13px] leading-relaxed shadow-sm ${
                msg.role === "user"
                  ? "bg-(--ctp-mauve)/15 border border-(--ctp-mauve)/30 text-(--ctp-text) rounded-tr-none"
                  : "bg-(--ctp-surface0)/90 border border-(--ctp-surface1)/60 text-(--ctp-text) rounded-tl-none"
              }`}
            >
              {msg.duration && <div className="mb-1 text-[10px] uppercase tracking-wider text-(--ctp-subtext0)">{msg.text.startsWith("Error:") ? "Error" : "Final answer"}</div>}
              <div className="min-w-0 space-y-2 break-words">
                {renderChatText(msg.text, true)}
              </div>
              {msg.planId && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => msg.planId && approvePlan(msg.planId)}
                  className="mt-3 flex items-center gap-1 rounded-md bg-(--ctp-green) px-3 py-1.5 text-xs font-medium text-(--ctp-crust) hover:bg-(--ctp-green) disabled:opacity-40"
                >
                  <Play className="h-3 w-3" />
                  Approve desktop integration
                </button>
              )}

              {msg.role === "model" && (
                <button
                  onClick={() => copyToClipboard(msg.text, msg.id)}
                  title="Copy response"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded bg-(--ctp-surface1)/80 hover:bg-(--ctp-overlay1) text-(--ctp-subtext1) transition-opacity"
                >
                  {copiedId === msg.id ? (
                    <Check className="h-3.5 w-3.5 text-(--ctp-green)" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex w-full max-w-[92%] min-w-0 flex-col items-start">
            <div className="flex items-center gap-1.5 mb-1 px-1">
              <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-(--ctp-mauve)" />
              <span className="text-[11px] font-medium text-(--ctp-subtext0)">DotCode AI</span>
              <span className="text-[10px] text-(--ctp-overlay1)">· working {elapsed(startedAt, now)}</span>
            </div>
            {steps.length ? <ToolSteps steps={steps} /> : <p className="px-1 font-mono text-[11px] text-(--ctp-overlay2)">Codex is inspecting...</p>}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input container */}
      <div className="p-3 border-t border-(--ctp-surface0) bg-(--ctp-mantle)/70">
        <div className="relative rounded-xl border border-(--ctp-surface1)/80 bg-(--ctp-base)/90 focus-within:border-(--ctp-mauve) focus-within:ring-1 focus-within:ring-(--ctp-mauve) transition-all shadow-inner">
          {/* ponytail: highlight-only overlay; inline icons in the editor need contenteditable. */}
          <div ref={highlightRef} aria-hidden="true" className="font-['Lilex_Nerd_Font',monospace] pointer-events-none absolute inset-x-0 top-0 h-[60px] overflow-hidden whitespace-pre-wrap break-words px-3.5 py-2.5 text-xs sm:text-[13px] text-(--ctp-text)">
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
            className="font-['Lilex_Nerd_Font',monospace] relative block h-[60px] w-full resize-none break-words bg-transparent px-3.5 py-2.5 text-xs sm:text-[13px] text-transparent caret-(--ctp-text) placeholder-(--ctp-overlay2) [scrollbar-width:none] focus:outline-none"
          />
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-(--ctp-surface0)/50 bg-(--ctp-mantle)/40">
            <span className="text-[10px] text-(--ctp-overlay2)">
              Press <kbd className="px-1 py-0.5 rounded bg-(--ctp-surface0) text-(--ctp-subtext0) border border-(--ctp-surface1) font-mono">Enter</kbd> to send
            </span>
            <div className="flex items-center gap-2">
              {isLoading && <button type="button" onClick={() => controllerRef.current?.abort()} className="flex items-center gap-1 rounded-md border border-(--ctp-surface1) px-3 py-1 text-xs text-(--ctp-subtext1)"><Square className="h-3 w-3" />Stop</button>}
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading || !workspace}
                className="flex items-center gap-1 rounded-md bg-(--ctp-mauve) px-3 py-1 text-xs font-medium text-(--ctp-crust) hover:bg-(--ctp-lavender) disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
