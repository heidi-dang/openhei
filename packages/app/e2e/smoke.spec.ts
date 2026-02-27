import { test, expect } from "./fixtures"
import { withSession } from "./actions"

async function seedMessage(sdk: any, sessionID: string, text: string) {
    await sdk.session.promptAsync({
        sessionID,
        noReply: true,
        parts: [{ type: "text", text }],
    })

    await expect
        .poll(
            async () => {
                const messages = await sdk.session.messages({ sessionID, limit: 1 }).then((r: any) => r.data ?? [])
                return messages.length
            },
            { timeout: 30_000 },
        )
        .toBeGreaterThan(0)
}

test.describe("UI Smoke Tests", () => {
    test("smoke: can open session and see the header", async ({ page, sdk, gotoSession }) => {
        await withSession(sdk, "smoke test session", async (session) => {
            await gotoSession(session.id)
            await page.waitForTimeout(1000)
            require('fs').writeFileSync('dom_header.html', await page.content())
            await expect(page.locator('[data-component="session-title"]')).toHaveText("smoke test session")
        })
    })

    test("smoke: can send a message and see it in the timeline", async ({ page, sdk, gotoSession }) => {
        await withSession(sdk, "smoke message test", async (session) => {
            await gotoSession(session.id)

            const input = page.locator('[data-component="prompt-input"]')
            await expect(input).toBeVisible()

            await input.fill("Hello smoke test")
            await input.press("Enter")

            await expect(page.getByText("Hello smoke test")).toBeVisible()
        })
    })

    test("smoke: auto-scroll baseline", async ({ page, sdk, gotoSession }) => {
        await withSession(sdk, "smoke scroll test", async (session) => {
            await gotoSession(session.id)

            // Seed a bunch of messages to trigger scroll
            for (let i = 0; i < 10; i++) {
                await seedMessage(sdk, session.id, `message ${i}`)
            }

            await page.reload()
            await page.waitForTimeout(1000)
            require('fs').writeFileSync('dom_scroll.html', await page.content())
            await expect(page.locator('[data-component="session-title"]')).toBeVisible()

            const scroller = page.locator(".scroll-view__viewport").first()
            await expect(scroller).toBeVisible()

            // Verify "Jump to bottom" button behavior
            // Initially it should be hidden if we are at bottom
            const jumpToBottom = page.locator('[data-component="jump-to-bottom"]')
            await expect(jumpToBottom).not.toBeVisible()

            // Scroll up manually
            await scroller.evaluate((el) => el.scrollTo({ top: 0 }))

            // Wait for it to specifically NOT be at bottom
            await expect(jumpToBottom).toBeVisible()

            // Click jump to bottom
            await jumpToBottom.click()
            await expect(jumpToBottom).not.toBeVisible()
        })
    })
})
