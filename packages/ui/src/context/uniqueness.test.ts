import { test, expect } from "vitest"
import { execSync } from "child_process"

test("enforce exactly one SettingsProvider export in codebase", () => {
    // Search for 'SettingsProvider' while ensuring it's an export (handles direct, destructuring, or named export)
    // We match 'export const ... SettingsProvider' or 'export { ... SettingsProvider'
    const output = execSync('grep -rE "export (const|.*\\{).*\\bSettingsProvider\\b" ../../packages/*/src --include="*.tsx" --include="*.ts"').toString()
    const lines = output.trim().split("\n").filter(l => !l.includes(".test.ts") && !l.includes(".runtime.test.ts"))

    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain("packages/ui/src/context/settings.tsx")
})

test("enforce exactly one PlatformProvider export in codebase", () => {
    const output = execSync('grep -rE "export (const|.*\\{).*\\bPlatformProvider\\b" ../../packages/*/src --include="*.tsx" --include="*.ts"').toString()
    const lines = output.trim().split("\n").filter(l => !l.includes(".test.ts") && !l.includes(".runtime.test.ts"))

    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain("packages/ui/src/context/platform.tsx")
})
