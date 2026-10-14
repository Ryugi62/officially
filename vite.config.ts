import { defineConfig } from "vite"
export default defineConfig({
  base: "./",
  build: { outDir: "dist", target: "es2022", sourcemap: false, rollupOptions: { input: { main: "index.html", paste: "paste.html" } } },
})
