import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachAgent, isLocalRequest } from "./agent.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use("/api", (req, res, next) => {
  if (!isLocalRequest(req)) return res.status(403).json({ error: "Local, same-origin requests only." });
  if (req.method !== "GET" && !req.is("application/json")) return res.status(415).json({ error: "JSON required." });
  next();
});
app.use(express.json({ limit: "512kb" }));
app.get("/api/health", (_req, res) => res.json({ ok: true, agent: "codex" }));
const stopAgent = attachAgent(app);
app.use("/api", (_req, res) => res.status(404).json({ error: "Unknown API endpoint. Restart DotCode if the frontend was updated." }));

if (process.env.NODE_ENV !== "production") {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, host: "127.0.0.1", proxy: {} },
    appType: "spa",
    root: path.resolve(__dirname, "frontend"),
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.resolve(__dirname, "frontend/dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => res.sendFile(path.resolve(distPath, "index.html")));
}

const server = app.listen(port, "127.0.0.1", () => console.log(`DotCode: http://127.0.0.1:${port}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { stopAgent(); server.close(); });
