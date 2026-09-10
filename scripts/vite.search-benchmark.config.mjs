import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    outDir: ".benchmark-dist",
    emptyOutDir: true,
    target: "es2020",
    minify: true,
    lib: {
      entry: resolve(process.cwd(), "src/infrastructure/search/ProductSearchBenchmark.ts"),
      formats: ["es"],
      fileName: () => "search-benchmark.js",
    },
  },
});
