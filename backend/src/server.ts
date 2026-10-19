import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, message: "Backend is running" });
});

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
