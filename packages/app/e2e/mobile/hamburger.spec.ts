import { test, expect } from "../fixtures"

test("mobile: hamburger opens sidebar", async ({ page, gotoSession }) => {
  // emulate a narrow mobile viewport to trigger mobile nav
  await page.setViewportSize({ width: 390, height: 844 })
  await gotoSession()

  // ensure the mobile toggle is visible and tappable
  const toggle = page.locator('[data-component="nav-mobile-toggle"]').first()
  await expect(toggle).toBeVisible()

  await toggle.click()

  // Sidebar opens: main should no longer have xl:border-l class
  const main = page.locator("main")
  await expect(main).not.toHaveClass(/xl:border-l/, { timeout: 2000 })
})
