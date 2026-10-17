import { defineConfig } from "vite";
import path from "node:path";

// Bundles the Express API into one ES module for the Vercel function in
// api/index.mjs. Dependencies stay external and are traced from node_modules.
export default defineConfig({
  publicDir: false,
  build: {
    ssr: path.resolve(import.meta.dirname, "server/vercel.ts"),
    outDir: "dist/vercel",
    target: "node22",
    minify: false,
    sourcemap: true,
    rollupOptions: {
      output: { format: "es", entryFileNames: "app.mjs" },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./client"),
      "@shared": path.resolve(import.meta.dirname, "./shared"),
    },
  },
});
