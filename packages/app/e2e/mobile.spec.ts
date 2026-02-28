import { test, expect } from "./fixtures"
import { withSession } from "./actions"

test.describe("Mobile Layout", () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test("mobile layout ignores desktop persisted widths", async ({ page, sdk, gotoSession }) => {
        // Set persisted desktop layout width in localStorage to simulate layout bug
        await page.addInitScript(() => {
            window.localStorage.setItem(
                "openhei.layout.v1",
                JSON.stringify({
                    sidebarWidth: 300,
                    fileTreeWidth: 350,
                    sessionWidth: 480
                })
            )
        })

        await withSession(sdk, "mobile layout test", async (session) => {
            await gotoSession(session.id)

            // Wait for app to render
            await page.waitForSelector('#root')
            await page.waitForTimeout(1000)

            const viewportWidth = 390

            // Verify that the root matches the viewport exactly
            const rootRect = await page.evaluate(() => document.getElementById('root')?.getBoundingClientRect())
            expect(rootRect?.width).toBe(viewportWidth)

            // Verify that the session panel container is not clamped
            const sessionPanelRect = await page.evaluate(() => {
                // The session panel is the direct parent of SessionComposerRegion,
                // which holds the prompt-input. Let's find it.
                const input = document.querySelector('[data-component="prompt-input"]')
                if (!input) return null
                // We want the panel container that was previously clamped by sessionPanelWidth
                const panel = input.closest('.flex-1.min-h-0.overflow-hidden')?.parentElement
                return panel?.getBoundingClientRect()
            })

            expect(sessionPanelRect).not.toBeNull()
            expect(sessionPanelRect?.width).toBe(viewportWidth)

            // Ensure the chat input is full width minus padding
            const inputRect = await page.evaluate(() => {
                const input = document.querySelector('[data-component="prompt-input"]')
                return input?.getBoundingClientRect()
            })
            expect(inputRect).not.toBeNull()
            // It should span most of the screen on mobile, not be compressed to e.g. <100px
            expect(inputRect!.width).toBeGreaterThan(300)
        })
    })
})
