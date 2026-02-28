import { test, expect } from "../fixtures"
import { withSession } from "../actions"

const DESKTOP_VIEWPORT = { width: 1280, height: 720 }
const MOBILE_VIEWPORT = { width: 390, height: 844 }

test.describe("Density Root Layout Regression Tests", () => {
  const TOLERANCE_PX = 6

  test("density-root fills viewport on desktop", async ({ page, sdk, gotoSession }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)

    await withSession(sdk, "desktop layout test", async (session) => {
      await gotoSession(session.id)
      await page.waitForSelector(".density-root")
      await page.waitForTimeout(500)

      // Dismiss Phase 5 banner if present to get accurate layout
      const dismissButton = page.locator('button:has-text("Dismiss")').first()
      if (await dismissButton.isVisible()) {
        await dismissButton.click()
        await page.waitForTimeout(300)
      }

      const info = await page.evaluate(() => {
        const densityRoot = document.querySelector(".density-root")
        const main = document.querySelector("main")
        const densityRootRect = densityRoot?.getBoundingClientRect()
        const mainRect = main?.getBoundingClientRect()
        return {
          densityRootHeight: densityRootRect?.height,
          densityRootBottom: densityRootRect?.bottom,
          mainHeight: mainRect?.height,
          mainBottom: mainRect?.bottom,
          viewportHeight: window.innerHeight,
        }
      })

      // density-root should match main element dimensions (within tolerance)
      expect(info.densityRootHeight).not.toBeNull()
      expect(info.mainHeight).not.toBeNull()
      expect(info.densityRootBottom).toBeLessThanOrEqual((info.mainBottom ?? 0) + TOLERANCE_PX)
      expect(info.densityRootHeight).toBeGreaterThanOrEqual(info.mainHeight! - TOLERANCE_PX)
    })
  })

  test("density-root fills viewport on mobile", async ({ page, sdk, gotoSession }) => {
    await page.setViewportSize(MOBILE_VIEWPORT)

    await withSession(sdk, "mobile layout test", async (session) => {
      await gotoSession(session.id)
      await page.waitForSelector(".density-root")
      await page.waitForTimeout(500)

      // Dismiss Phase 5 banner if present to get accurate layout
      const dismissButton = page.locator('button:has-text("Dismiss")').first()
      if (await dismissButton.isVisible()) {
        await dismissButton.click()
        await page.waitForTimeout(300)
      }

      const info = await page.evaluate(() => {
        const densityRoot = document.querySelector(".density-root")
        const main = document.querySelector("main")
        const densityRootRect = densityRoot?.getBoundingClientRect()
        const mainRect = main?.getBoundingClientRect()
        return {
          densityRootHeight: densityRootRect?.height,
          densityRootBottom: densityRootRect?.bottom,
          mainHeight: mainRect?.height,
          mainBottom: mainRect?.bottom,
          viewportHeight: window.innerHeight,
        }
      })

      expect(info.densityRootHeight).not.toBeNull()
      expect(info.mainHeight).not.toBeNull()
      expect(info.densityRootBottom).toBeLessThanOrEqual((info.mainBottom ?? 0) + TOLERANCE_PX)
      expect(info.densityRootHeight).toBeGreaterThanOrEqual(info.mainHeight! - TOLERANCE_PX)
    })
  })

  test("composer visible without scroll on desktop", async ({ page, sdk, gotoSession }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)

    await withSession(sdk, "composer visibility test", async (session) => {
      await gotoSession(session.id)
      await page.waitForSelector('[data-component="prompt-input"]')
      await page.waitForTimeout(500)

      const composerRect = await page.evaluate(() => {
        const el = document.querySelector('[data-component="prompt-input"]')
        return el?.getBoundingClientRect()
      })

      expect(composerRect).not.toBeNull()
      expect(composerRect!.bottom).toBeLessThanOrEqual(DESKTOP_VIEWPORT.height)
    })
  })
})
