import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Throwaway UI server: separate entry, styles and data; no application API proxy.
export default defineConfig({
  mode: "prototype",
  root: fileURLToPath(new URL("./prototype", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
});
