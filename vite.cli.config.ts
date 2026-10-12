import { defineConfig } from "vite"
import { builtinModules } from "node:module"
// Bundles the CLI into one ESM file so `npx github:Ryugi62/officially` needs no build step.
export default defineConfig({
  build: {
    ssr: "src/infrastructure/cli-entry.ts",
    outDir: "bin",
    emptyOutDir: false,
    target: "node22",
    rollupOptions: {
      external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
      output: { entryFileNames: "officially.mjs", format: "es", banner: "#!/usr/bin/env node", inlineDynamicImports: true },
    },
  },
  ssr: { noExternal: true },
})
