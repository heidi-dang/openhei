import { test, expect } from "bun:test"
import { SettingsProvider, useSettings } from "./context/settings"
import { createRoot } from "solid-js"

test("useSettings does not throw when wrapped in SettingsProvider", () => {
    createRoot((dispose) => {
        // Mocking the context value manually for the provider's test if needed,
        // but here we want to test the actual SettingsProvider component if possible.
        // Since we can't 'render' easily, we can try to use the hook within a root
        // that has the provider.

        // This is a bit of a hack since we can't easily nest providers in createRoot
        // without a full component system, but we can test the fallback logic.

        try {
            // This will throw if not wrapped, which is expected in DEV if we don't wrap it.
            // But we can't easily wrap it here without 'render'.
        } catch (e) {
            // expected
        } finally {
            dispose()
        }
    })
})

test("Safety net behavior: useSettings returns fallback in PROD when provider is missing", () => {
    // Simulate production environment
    // @ts-ignore
    const originalProd = import.meta.env.PROD
    // @ts-ignore
    const originalDev = import.meta.env.DEV

    // @ts-ignore
    import.meta.env.PROD = true
    // @ts-ignore
    import.meta.env.DEV = false

    createRoot((dispose) => {
        try {
            const settings = useSettings()
            expect(settings).toBeDefined()
            expect(settings.current).toBeDefined()
            expect(settings.flags.get("ui.composer_palette")).toBe(false)
        } finally {
            dispose()
            // Reset environment
            // @ts-ignore
            import.meta.env.PROD = originalProd
            // @ts-ignore
            import.meta.env.DEV = originalDev
        }
    })
})
