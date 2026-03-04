import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`
const serverHost = process.env.PLAYWRIGHT_SERVER_HOST ?? "localhost"
const serverPort = process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"
const command = `bun run dev -- --host 0.0.0.0 --port ${port}`
const reuse = !process.env.CI

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: process.env.PLAYWRIGHT_FULLY_PARALLEL === "1",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { outputFolder: "e2e/playwright-report", open: "never" }], ["line"]],
  webServer: {
    command,
    url: baseURL,
    reuseExistingServer: reuse,
    // increase timeout in CI to reduce flakiness when bootstrapping dependencies
    timeout: process.env.CI ? 240_000 : 120_000,
    env: {
      VITE_OPENHEI_SERVER_HOST: serverHost,
      VITE_OPENHEI_SERVER_PORT: serverPort,
      // disable plugin/bootstrap steps that attempt to run `bun install` inside temp config
      OPENHEI_DISABLE_DEFAULT_PLUGINS: process.env.OPENHEI_DISABLE_DEFAULT_PLUGINS ?? "true",
      OPENHEI_DISABLE_LSP_DOWNLOAD: process.env.OPENHEI_DISABLE_LSP_DOWNLOAD ?? "true",
    },
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    httpCredentials: {
      username: "admin",
      password: "password",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
