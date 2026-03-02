import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

describe("GhostCode skeleton CSS", () => {
  it("ghost-code-container has min-width and min-height defined", () => {
    const cssPath = join(__dirname, "../src/components/ghost-code.css")
    const css = readFileSync(cssPath, "utf-8")

    expect(css).toContain("min-width: 200px")
    expect(css).toContain("min-height: 120px")
  })

  it("has prefers-reduced-motion handling", () => {
    const cssPath = join(__dirname, "../src/components/ghost-code.css")
    const css = readFileSync(cssPath, "utf-8")

    expect(css).toContain("prefers-reduced-motion")
    expect(css).toContain("animation: none")
  })
})
