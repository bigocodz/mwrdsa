import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "apps/supplier"),
  publicDir: path.resolve(__dirname, "public"),
  define: {
    __BUILD_PORTAL__: JSON.stringify("supplier")
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: { port: 5174 },
  preview: { port: 5174 },
  build: {
    outDir: path.resolve(__dirname, "dist/supplier"),
    emptyOutDir: true
  }
});
