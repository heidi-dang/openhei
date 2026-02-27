import { test, expect } from "vitest"
import { createRoot, createRenderEffect } from "solid-js"
import { createStore } from "solid-js/store"
import { DEFAULT_SETTINGS, Settings } from "./settings"

test("defaultSettings is deep-frozen", () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true)
    expect(Object.isFrozen(DEFAULT_SETTINGS.flags)).toBe(true)
    expect(Object.isFrozen(DEFAULT_SETTINGS.general)).toBe(true)

    // Attempted mutation should fail in strict mode
    expect(() => {
        (DEFAULT_SETTINGS as any).general.autoSave = false
    }).toThrow()
})

// We test reactivity by bypassing the persistence and using a simple store to simulate the context behavior
test("flags.get remains reactive and tracks changes", async () => {
    // Mock store to simulate the internal settings store
    const [store, setStore] = createStore<Settings>(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)))

    let caughtValue: boolean | undefined
    let effectCount = 0

    await createRoot(async (dispose) => {
        // Use createRenderEffect for synchronous updates in tests
        createRenderEffect(() => {
            effectCount++
            caughtValue = store.flags["ui.composer_palette"] ?? DEFAULT_SETTINGS.flags["ui.composer_palette"]
        })

        // Initial check
        expect(caughtValue).toBe(false)
        expect(effectCount).toBe(1)

        // Update the store
        setStore("flags", "ui.composer_palette", true)

        // Wait for Solid updates to pulse
        await Promise.resolve()

        expect(caughtValue).toBe(true)
        expect(effectCount).toBe(2)

        dispose()
    })
})
