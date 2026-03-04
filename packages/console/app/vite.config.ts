import { defineConfig, PluginOption } from "vite"
import { solidStart } from "@solidjs/start/config"
import { nitro } from "nitro/vite"

export default defineConfig({
  plugins: [
    solidStart({
      middleware: "./src/middleware.ts",
    }) as PluginOption,
    nitro({
      compatibilityDate: "2024-09-19",
      preset: "cloudflare_module",
      cloudflare: {
        nodeCompat: true,
      },
      // SSE Optimization: Enable HTTP/2 for better streaming performance
      // This prevents Head-of-Line blocking that occurs with HTTP/1.1
      // SSE Optimization: Route rules for streaming endpoints
      routeRules: {
        "/zen/**": {
          // Disable compression for SSE streams to prevent buffering delays
          // Enable CORS for streaming endpoints
          cors: true,
          headers: {
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache, no-transform",
          },
        },
      },
    }),
  ],
  server: {
    allowedHosts: true,
    // SSE Optimization: Enable HTTP/2 in dev server
  },
  build: {
    rollupOptions: {
      external: ["cloudflare:workers"],
    },
    minify: false,
  },
})
