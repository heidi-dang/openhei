import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"

describe("Viewport Meta Tag", () => {
  const indexHtmlPath = join(import.meta.dir, "../index.html")
  const htmlContent = readFileSync(indexHtmlPath, "utf-8")

  test("viewport meta tag is present", () => {
    const viewportPattern = /<meta\s+name=["']viewport["']/i
    expect(htmlContent).toMatch(viewportPattern)
  })

  test("no duplicate viewport meta tags", () => {
    const viewportMatches = htmlContent.match(/<meta\s+name=["']viewport["']/gi)
    const count = viewportMatches?.length ?? 0
    expect(count).toBe(1)
  })

  test("viewport meta tag contains required attributes", () => {
    const viewportPattern = /<meta\s+name=["']viewport["']\s+content=["'][^"']*width=device-width[^"']*["']/i
    expect(htmlContent).toMatch(viewportPattern)
  })
})
