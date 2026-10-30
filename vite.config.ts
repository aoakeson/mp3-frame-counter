import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The upload page lives in web/ and builds to dist/, which both Node (server.ts) and
// Cloudflare (wrangler.jsonc) serve. samples/ is copied in so the page can offer the sample.
export default defineConfig({
  root: "web",
  publicDir: "../samples",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./web", import.meta.url)) },
  },
  build: { outDir: "../dist", emptyOutDir: true },
  // `npm run dev:web` serves the page with hot reload and forwards API calls to `npm run dev`.
  server: { proxy: { "/file-upload": "http://localhost:3000" } },
});
