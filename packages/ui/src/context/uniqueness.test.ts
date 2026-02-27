import { test, expect } from "bun:test"
import { execSync } from "child_process"

test("enforce exactly one SettingsContext definition in codebase", () => {
    // Search for 'name: "Settings"' within createSimpleContext calls
    // We expect exactly one definition in packages/ui/src/context/settings.tsx
    // The grep is run from the repository root (navigating up from packages/ui)
    const output = execSync('grep -r "name: \\"Settings\\"" ../../packages/*/src --include="*.tsx" --include="*.ts"').toString()
    const lines = output.trim().split("\n").filter(l => !l.includes(".test.ts") && !l.includes(".runtime.test.ts"))

    expect(lines.length).toBe(1)
    expect(lines[0]).toContain("packages/ui/src/context/settings.tsx")
})

test("enforce exactly one PlatformContext definition in codebase", () => {
    const output = execSync('grep -r "name: \\"Platform\\"" ../../packages/*/src --include="*.tsx" --include="*.ts"').toString()
    const lines = output.trim().split("\n").filter(l => !l.includes(".test.ts") && !l.includes(".runtime.test.ts"))

    expect(lines.length).toBe(1)
    expect(lines[0]).toContain("packages/ui/src/context/platform.tsx")
})
