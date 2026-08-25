import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  base: "./",
  plugins: [react()],
  css: {
    // Config inline vazia. Sem isto o Vite sobe diretórios procurando um PostCSS
    // config e encontra o do app Next.js na raiz do repositório, que exige
    // `@tailwindcss/postcss` — fazendo o build da extensão depender das
    // dependências do app estarem instaladas, o que quebra em clone limpo, em
    // worktree e em CI. A extensão tem só um <style> de CSS puro no HTML.
    postcss: {},
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    // Each contribution page is built as a separate entry point
    rollupOptions: {
      input: {
        "work-item-form": resolve(__dirname, "src/work-item-form/index.html"),
      },
      output: {
        entryFileNames: "[name]/[name].js",
        chunkFileNames: "shared/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name ?? "";
          if (name.endsWith(".css")) return "styles/[name][extname]";
          return "assets/[name][extname]";
        },
      },
    },
  },
});
