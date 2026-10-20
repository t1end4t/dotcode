import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachAgent, isLocalRequest } from "./agent.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT ?? 3000);
let vite: import("vite").ViteDevServer | undefined;

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
  vite = await createServer({
    server: { middlewareMode: true, host: "0.0.0.0", proxy: {} },
    appType: "spa",
    root: path.resolve(__dirname, "frontend"),
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.resolve(__dirname, "frontend/dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => res.sendFile(path.resolve(distPath, "index.html")));
}

const host = process.env.HOST ?? "0.0.0.0";
const server = app.listen(port, host, () => {
  const address = server.address();
  if (!address || typeof address === "string") return;
  const url = `http://127.0.0.1:${address.port}`;
  console.log(`DotCode: ${url}`);
  if (vite) {
    vite.resolvedUrls = { local: [url], network: [] };
    vite.openBrowser();
  }
});
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
  server.close();
  void stopAgent().finally(() => vite?.close());
});
