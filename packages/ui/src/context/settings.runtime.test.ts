import { test, expect } from "vitest"
import { useSettings } from "./settings"

test("useSettings returns default settings outside of provider in production", () => {
    // Simulate production environment
    // @ts-ignore
    import.meta.env.PROD = true
    // @ts-ignore
    import.meta.env.DEV = false

    try {
        const settings = useSettings()
        expect(settings).toBeDefined()
        expect(settings.current).toBeDefined()
        expect(settings.flags.get("ui.composer_palette")).toBe(false)
    } catch (e) {
        throw new Error(`useSettings threw an error in production: ${e}`)
    } finally {
        // Reset environment
        // @ts-ignore
        import.meta.env.PROD = false
        // @ts-ignore
        import.meta.env.DEV = true
    }
})

test("useSettings throws error outside of provider in development", () => {
    // Ensure development environment
    // @ts-ignore
    import.meta.env.PROD = false
    // @ts-ignore
    import.meta.env.DEV = true

    expect(() => useSettings()).toThrow("Settings context must be used within a SettingsProvider")
})
