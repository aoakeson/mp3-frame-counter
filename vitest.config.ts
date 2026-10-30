import { defineConfig } from "vitest/config";

// vite.config.ts roots Vite in web/ for the upload page. Tests live in src/, so they get their own config.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
