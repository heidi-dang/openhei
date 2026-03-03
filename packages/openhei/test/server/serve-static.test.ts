import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { serveStatic } from "hono/bun"
import { Hono } from "hono"
import { tmpdir } from "../fixture/fixture"
import path from "path"

const projectRoot = path.join(__dirname, "../..")

describe("serveStatic double-next regression", () => {
  let dashboardDir: string

  beforeEach(async () => {
    const tmp = await tmpdir()
    dashboardDir = tmp.path
    await Bun.write(path.join(dashboardDir, "index.html"), "<html>test</html>")
    await Bun.write(path.join(dashboardDir, "test.js"), "console.log('test')")
    process.env.OPENHEI_DASHBOARD_DIR = dashboardDir
  })

  afterEach(() => {
    process.env.OPENHEI_DASHBOARD_DIR = undefined
  })

  test("serveStatic without next should not call next", async () => {
    const app = new Hono()

    let nextCalled = false

    app.get("/*", async (c, next) => {
      const res = await serveStatic({ root: dashboardDir })(c, () => Promise.resolve())
      if (res) return res
      return next()
    })

    app.get("/api/test", (c) => c.text("api"))

    const res = await app.fetch(new Request("http://localhost/test.js"))
    expect(res.status).not.toBe(500)
    expect(res.status).toBe(200)
  })

  test("missing static file should not call next twice", async () => {
    const app = new Hono()

    let nextCallCount = 0

    app.get("/*", async (c, next) => {
      nextCallCount++
      const res = await serveStatic({ root: dashboardDir })(c, () => Promise.resolve())
      if (res) return res
      return next()
    })

    app.get("/api/test", (c) => c.text("api"))

    const res = await app.fetch(new Request("http://localhost/nonexistent.js"))
    expect(res.status).not.toBe(500)
    expect(nextCallCount).toBe(1)
  })

  test("SPA fallback should work without double-next", async () => {
    const app = new Hono()

    let nextCallCount = 0

    app.get("/*", async (c, next) => {
      nextCallCount++
      const res = await serveStatic({ path: "./index.html", root: dashboardDir })(c, () => Promise.resolve())
      if (res) return res
      return next()
    })

    app.get("/api/test", (c) => c.text("api"))

    const res = await app.fetch(new Request("http://localhost/some/path"))
    expect(res.status).not.toBe(500)
    expect(nextCallCount).toBe(1)
  })

  test("API routes should not be affected by static middleware", async () => {
    const app = new Hono()

    app.get("/*", async (c, next) => {
      const res = await serveStatic({ root: dashboardDir })(c, () => Promise.resolve())
      if (res) return res
      return next()
    })

    app.get("/api/test", (c) => c.text("api"))

    const res = await app.fetch(new Request("http://localhost/api/test"))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("api")
  })
})
