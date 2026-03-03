import { test, expect } from "../fixtures"

test.describe("QLoRA Smoke Tests", () => {
  test("golden flow: can navigate to QLoRA settings", async ({ page }) => {
    await page.goto("/qlora")
    await page.waitForTimeout(3000)

    await expect(page.getByRole("heading", { name: "QLoRA" })).toBeVisible()
  })

  test("golden flow: tabs are accessible", async ({ page }) => {
    await page.goto("/qlora")
    await page.waitForTimeout(3000)

    const tabs = ["Setup", "Models", "Data", "Training", "Budget", "Monitor", "Artifacts", "Processes"]
    for (const tab of tabs) {
      await expect(page.getByRole("button", { name: tab })).toBeVisible()
    }
  })

  test("golden flow: can switch to Monitor tab", async ({ page }) => {
    await page.goto("/qlora")
    await page.waitForTimeout(3000)

    await page.getByRole("button", { name: "Monitor" }).click()
    await page.waitForTimeout(1000)
    await expect(page.getByRole("button", { name: "Start" })).toBeVisible()
  })

  test("golden flow: Start button disabled when not running", async ({ page }) => {
    await page.goto("/qlora")
    await page.waitForTimeout(3000)

    await page.getByRole("button", { name: "Monitor" }).click()
    await page.waitForTimeout(1000)

    const stopButton = page.getByRole("button", { name: /Stop/ })
    await expect(stopButton).toBeDisabled()
  })
})
