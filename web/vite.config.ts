import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.WEB_PORT ?? 5173);
const apiPort = Number(process.env.PORT ?? 8787);

export default defineConfig({
  root,
  plugins: [react()],
  server: {
    port,
    host,
    // Allow LAN access when bound to 0.0.0.0 / true
    strictPort: true,
    proxy: {
      "/api": {
        // Always proxy to local API process (bound separately via HOST)
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host,
  },
  build: {
    outDir: resolve(root, "dist"),
    emptyOutDir: true,
  },
});
