import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "apps/client"),
  publicDir: path.resolve(__dirname, "public"),
  define: {
    __BUILD_PORTAL__: JSON.stringify("client")
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: { port: 5173 },
  preview: { port: 5173 },
  build: {
    outDir: path.resolve(__dirname, "dist/client"),
    emptyOutDir: true
  }
});
