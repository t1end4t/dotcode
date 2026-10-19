import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

// Initialize Gemini SDK with User-Agent header as required
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;
if (apiKey) {
  try {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  } catch (err) {
    console.warn("Failed to initialize GoogleGenAI client:", err);
  }
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, message: "Backend is running", hasAiKey: Boolean(apiKey) });
});

// AI Chat endpoint for the Right Pane Copilot
app.post("/api/ai/chat", async (req, res) => {
  try {
    const { message, history = [], currentItems = [] } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    // Prepare system context summarizing the library of tools/apps/courses
    const installedList = currentItems
      .filter((i: any) => i.installed)
      .map((i: any) => `${i.name} (${i.category}, ${i.enabled ? 'Enabled' : 'Disabled'})`)
      .join(", ") || "None yet";

    const catalogSummary = currentItems
      .slice(0, 39)
      .map((i: any) => `- ${i.name} [${i.repo}]: ${i.description} (Category: ${i.category}, Installed: ${i.installed}, Enabled: ${i.enabled})`)
      .join("\n");

    const systemInstruction = `You are the DotCode AI Assistant, a high-leverage developer copilot integrated into the DotCode Tool & Resource Manager.
The user is managing 39 curated open-source tools, applications, coursebooks, and AI engineering repositories imported from their dotcode markdown collection.

Current User Environment Context:
- Installed & Enabled Stack: ${installedList}
- Catalog of all available items in the manager:
${catalogSummary}

Your Responsibilities:
1. Advise the user on which tools, apps, or courses best fit their engineering workflow or project needs.
2. Provide concise installation guides, CLI tips, command flags, or configuration snippets when asked about any item (e.g. disktree, jevgrep, harper, airllm, repowise).
3. Compare tools objectively (e.g., Harper vs traditional linters, AirLLM vs llama.cpp-adaptive-kv-streaming, Jevgrep vs standard jq/grep).
4. Recommend actionable next steps (like "Click Install on Harper and enable it to get instant code spell-checking").
5. Format responses cleanly with concise markdown: use backticks for commands, clean bullet points, and avoid excessive marketing fluff or generic AI boilerplate.
Be sharp, technical, and immediately practical.`;

    if (aiClient) {
      try {
        // Construct conversation turns
        const contents: any[] = [];
        
        // Add previous history turns if provided
        for (const turn of history.slice(-6)) {
          if (turn.role === "user" || turn.role === "model") {
            contents.push({
              role: turn.role,
              parts: [{ text: turn.text || turn.content || "" }],
            });
          }
        }

        // Add current prompt
        contents.push({
          role: "user",
          parts: [{ text: message }],
        });

        const response = await aiClient.models.generateContent({
          model: "gemini-3.8-flash",
          contents: contents.length === 1 ? message : contents,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });

        const reply = response.text || "I was unable to generate a response. Please try again.";
        return res.json({ reply });
      } catch (geminiError: any) {
        console.error("Gemini API call error:", geminiError);
        // Fall back to intelligent response if quota/transient error occurs
      }
    }

    // Graceful fallback response when API key is missing or call fails
    const lower = message.toLowerCase();
    let reply = "";
    if (lower.includes("install") || lower.includes("how to run")) {
      reply = `**Installation & Setup Guide**\n\nTo install items in your DotCode stack:\n- **CLI Tools (Rust/Go)**: Use \`cargo install <tool>\` or \`brew install <tool>\` (e.g. \`cargo install disktree\`, \`cargo install harper-ls\`, \`cargo install jevgrep\`).\n- **Agent Skills**: Run \`npx skills add <repo>\` (e.g. \`npx skills add miqdadbadjuber/anti-slop\`).\n- **Python Tools / Models**: Run \`pip install airllm\` or \`pip install pageindex-engine\`.\n\nYou can also click the **Install** button directly on any card in the GUI to track its lifecycle!`;
    } else if (lower.includes("airllm") || lower.includes("70b") || lower.includes("gpu")) {
      reply = `**AirLLM (\`lyogavin/airllm\`) Overview**\n\nAirLLM executes 70B+ parameter models on modest GPUs (even 4GB-8GB VRAM) by streaming transformer layers sequentially from disk/CPU into GPU VRAM.\n\n- **Install**: \`pip install airllm\`\n- **Best For**: Running Llama 3.3 70B or DeepSeek locally without needing expensive $10k multi-GPU rigs.\n- **Trade-off**: Lower tokens/sec latency due to disk I/O, but enables running massive models that would otherwise fail with OOM errors.`;
    } else if (lower.includes("disktree") || lower.includes("disk")) {
      reply = `**DiskTree (\`tobi/disktree\`)**\n\nUltra-fast interactive terminal disk usage visualizer written in Rust. It lets you scan directories, visualize disk usage trees, and quickly identify bloated \`node_modules\`, \`.git\`, or Docker build caches.\n\n- **Install**: \`cargo install disktree\`\n- **Usage**: \`disktree .\``;
    } else if (lower.includes("recommend") || lower.includes("suggest") || lower.includes("start")) {
      reply = `**Recommended Core Stack from your 39 Items**:\n\n1. **Harper** (\`Automattic/harper\`): Grammar and spelling linter for codebases—zero latency English checking in docstrings.\n2. **DiskTree** (\`tobi/disktree\`): Quick terminal disk space visualization.\n3. **Anti-Slop** (\`miqdadbadjuber/anti-slop\`): Clean UI rules to avoid generic AI code generation.\n4. **System Design Resources** (\`ashishps1/awesome-system-design-resources\`): Outstanding reference for distributed architectures.\n\nToggle the **Install** and **Enable** switches on these cards to customize your active workbench.`;
    } else {
      reply = `I'm analyzing your DotCode collection of 39 tools, apps, and learning resources.\n\nAsk me about:\n- Setting up local LLM inference (\`airllm\`, \`llama.cpp-adaptive-kv-streaming\`)\n- Code quality & linting tools (\`harper\`, \`repowise\`, \`betterleaks\`, \`jevgrep\`)\n- Desktop applications (\`ab-download-manager\`, \`CloakBrowser\`, \`DroidDesk\`)\n- Architecture & systems courses (\`cs341-illinois/coursebook\`, \`system-design-notes\`)`;
    }

    return res.json({ reply });
  } catch (err: any) {
    console.error("AI chat handler error:", err);
    return res.status(500).json({ error: "Failed to process chat message" });
  }
});

// Vite middleware or static serving
const isProd = process.env.NODE_ENV === "production";

if (!isProd) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, host: "0.0.0.0" },
    appType: "spa",
    root: path.resolve(__dirname, "frontend"),
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.resolve(__dirname, "frontend/dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on http://0.0.0.0:${port}`);
});
