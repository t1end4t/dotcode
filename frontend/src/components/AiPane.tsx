import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Send,
  X,
  Trash2,
  Copy,
  Check,
  Cpu,
  Terminal,
  BookOpen,
  ArrowRight,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { ManageableItem } from "../data/items";

interface Message {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: string;
}

interface AiPaneProps {
  isOpen: boolean;
  onClose: () => void;
  items: ManageableItem[];
  prefilledPrompt?: string;
  onClearPrefilledPrompt?: () => void;
}

export const AiPane: React.FC<AiPaneProps> = ({
  isOpen,
  onClose,
  items,
  prefilledPrompt,
  onClearPrefilledPrompt,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "initial-welcome",
      role: "model",
      text: "👋 Hi! I'm your **DotCode Copilot** powered by **Gemini 3.8 Flash**.\n\nI have full context on your **39 curated tools, apps, and learning resources**. Ask me for:\n- **Installation scripts & CLI flags** (e.g. `disktree`, `jevgrep`, `harper`)\n- **Local AI & model execution** (e.g. `airllm`, `llama.cpp-adaptive-kv-streaming`)\n- **Systems architecture & course roadmaps** (`cs341-illinois/coursebook`)\n- **Stack recommendations** based on what you are building today.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const installedCount = items.filter((i) => i.installed).length;
  const enabledCount = items.filter((i) => i.enabled).length;

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

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          history: messages.map((m) => ({
            role: m.role,
            content: m.text,
          })),
          currentItems: items.map((item) => ({
            name: item.name,
            repo: item.repo,
            category: item.category,
            description: item.description,
            installed: item.installed,
            enabled: item.enabled,
            customCommand: item.customCommand,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      const modelMsg: Message = {
        id: `model-${Date.now()}`,
        role: "model",
        text: data.reply || "I received an empty response. Please try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, modelMsg]);
    } catch (err: any) {
      console.error("AI error:", err);
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: "model",
        text: `⚠️ **Unable to connect to AI server**: ${err.message || "Unknown error"}.\n\nYou can still browse commands, toggle items, and customize tools across your workbench.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearChat = () => {
    setMessages([
      {
        id: "cleared-welcome",
        role: "model",
        text: "Chat cleared. What can I help you inspect, install, or customize from your 39 DotCode resources?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const quickPrompts = [
    {
      label: "Run 70B models locally",
      prompt: "How can I run a 70B LLM using AirLLM and llama.cpp-adaptive-kv-streaming on a laptop?",
      icon: Cpu,
    },
    {
      label: "Generate Bash install script",
      prompt: "Generate a bash setup script to install all currently enabled tools in my DotCode stack.",
      icon: Terminal,
    },
    {
      label: "Compare Harper vs conventional linters",
      prompt: "Compare Automattic/harper with typical linters. Why is it useful for code comments and docs?",
      icon: BookOpen,
    },
    {
      label: "Systems & Architecture study plan",
      prompt: "Create a 3-week study roadmap based on CS 341 Coursebook and System Design Resources.",
      icon: Sparkles,
    },
  ];

  if (!isOpen) return null;

  return (
    <aside
      className={`fixed inset-y-0 right-0 z-40 flex flex-col border-l border-slate-800 bg-slate-900/95 backdrop-blur-xl transition-all duration-200 shadow-2xl ${
        isExpanded ? "w-full md:w-[620px]" : "w-full sm:w-[420px] lg:w-[460px]"
      }`}
    >
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
                Gemini 3.8 Flash
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {installedCount} installed · {enabledCount} enabled · 39 total
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "Standard width" : "Expand width"}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={clearChat}
            title="Clear conversation"
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
          >
            <Trash2 className="h-4 w-4" />
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

      {/* Quick Prompts Bar */}
      <div className="px-4 py-2.5 border-b border-slate-800/60 bg-slate-950/30 overflow-x-auto">
        <div className="text-[11px] font-medium text-slate-400 mb-1.5 flex items-center justify-between">
          <span>Quick actions & questions:</span>
        </div>
        <div className="flex gap-1.5 pb-0.5 scrollbar-thin">
          {quickPrompts.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={idx}
                onClick={() => handleSend(item.prompt)}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-slate-100 hover:border-slate-700 transition-all text-left"
              >
                <Icon className="h-3 w-3 text-indigo-400" />
                <span>{item.label}</span>
              </button>
            );
          })}
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

            <div
              className={`relative group max-w-[92%] rounded-xl px-3.5 py-2.5 text-xs sm:text-[13px] leading-relaxed shadow-sm ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-tr-none"
                  : "bg-slate-800/90 border border-slate-700/60 text-slate-200 rounded-tl-none font-sans"
              }`}
            >
              <div className="prose prose-invert prose-xs max-w-none break-words whitespace-pre-wrap">
                {msg.text}
              </div>

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
              <span className="text-[10px] text-slate-600">· thinking</span>
            </div>
            <div className="rounded-xl rounded-tl-none border border-slate-700/60 bg-slate-800/90 px-4 py-3 text-xs text-slate-300 flex items-center gap-2">
              <div className="flex space-x-1">
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.3s]"></div>
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.15s]"></div>
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400"></div>
              </div>
              <span className="text-slate-400 text-xs">Reasoning over 39 tools & stack...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input container */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/70">
        <div className="relative rounded-xl border border-slate-700/80 bg-slate-900/90 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all shadow-inner">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about installation, tool comparisons, or stack advice..."
            rows={2}
            className="w-full resize-none bg-transparent px-3.5 py-2.5 text-xs sm:text-[13px] text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-800/50 bg-slate-950/40">
            <span className="text-[10px] text-slate-500">
              Press <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">Enter</kbd> to send
            </span>
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className="flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <span>Send</span>
              <Send className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
