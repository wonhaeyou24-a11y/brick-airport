import { defineConfig } from "vite";

// Brick Airport — Vite configuration
// Plain TypeScript + Three.js, no framework plugins.
export default defineConfig({
  base: "./",
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2020",
    outDir: "dist",
    sourcemap: true,
  },
});
