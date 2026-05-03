import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "apps/backoffice"),
  publicDir: path.resolve(__dirname, "public"),
  define: {
    __BUILD_PORTAL__: JSON.stringify("backoffice")
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: { port: 5175 },
  preview: { port: 5175 },
  build: {
    outDir: path.resolve(__dirname, "dist/backoffice"),
    emptyOutDir: true
  }
});
