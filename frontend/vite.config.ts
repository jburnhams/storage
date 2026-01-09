import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname),
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    manifest: true,
    sourcemap: 'inline',
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/auth': 'http://localhost:8787',
    }
  }
});
