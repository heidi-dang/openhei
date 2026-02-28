import { test, expect } from "./fixtures"
import { withSession } from "./actions"

const MOBILE_VIEWPORT_WIDTH = 375
const MOBILE_VIEWPORT_HEIGHT = 812

test.describe("Mobile Layout Regression Tests", () => {
  test("mobile: layout renders correctly at mobile viewport width", async ({ page, sdk, gotoSession }) => {
    await page.setViewportSize({ width: MOBILE_VIEWPORT_WIDTH, height: MOBILE_VIEWPORT_HEIGHT })

    await withSession(sdk, "mobile layout test", async (session) => {
      await gotoSession(session.id)
      await page.waitForTimeout(1000)

      const html = await page.content()

      expect(html).toContain("viewport")

      const viewport = page.locator('meta[name="viewport"]')
      await expect(viewport).toHaveAttribute("content", /width=device-width/)

      const root = page.locator("#root")
      await expect(root).toBeVisible()

      await expect(page.locator('[data-component="session-title"]')).toBeVisible()
    })
  })

  test("mobile: no duplicate viewport meta tags", async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_VIEWPORT_WIDTH, height: MOBILE_VIEWPORT_HEIGHT })
    await page.goto("/")
    await page.waitForTimeout(2000)

    const viewportMetaTags = await page.locator('meta[name="viewport"]').count()
    expect(viewportMetaTags).toBe(1)
  })

  test("mobile: settings general section is accessible", async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_VIEWPORT_WIDTH, height: MOBILE_VIEWPORT_HEIGHT })
    await page.goto("/")
    await page.waitForTimeout(2000)

    // Check Phase5 banner is present (data-testid="phase5-banner")
    const phase5Banner = page.locator('[data-testid="phase5-banner"]')
    await expect(phase5Banner).toBeVisible({ timeout: 10000 })

    // Navigate to settings
    await page.keyboard.press("Meta+,")

    // Wait for settings dialog
    await page.waitForTimeout(1000)

    // Check that general settings section is present
    const generalSettings = page.locator("text=General").first()
    await expect(generalSettings).toBeVisible({ timeout: 10000 })
  })
})
