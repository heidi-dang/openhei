import { defineConfig } from "vite"
import desktopPlugin from "./vite"

export default defineConfig({
  plugins: [desktopPlugin] as any,
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 5000,
    strictPort: true,
  },
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return
          if (id.includes("katex")) return "katex"
          if (id.includes("@pierre/diffs")) return "diffs"
          if (id.includes("@opentui")) return "opentui"
          return "vendor"
        },
      },
    },
    // sourcemap: true,
  },
})
