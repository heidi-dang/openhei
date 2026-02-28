import type { Argv } from "yargs"
import path from "path"
import { UI } from "../ui"
import { Installation } from "../../installation"

export const DoctorCommand = {
  command: "doctor",
  describe: "diagnose openhei installation and verify build integrity",
  builder: (yargs: Argv) => {
    return yargs.option("fix", {
      describe: "attempt to fix issues if possible",
      type: "boolean",
      default: false,
    })
  },
  handler: async () => {
    UI.empty()
    UI.println(UI.Style.TEXT_INFO_BOLD + "  OpenHei Doctor")
    UI.empty()

    let hasErrors = false

    // 1. Check binary path
    const binaryPath = process.execPath
    UI.println(UI.Style.TEXT_INFO_BOLD + "  Binary Path: ", UI.Style.TEXT_NORMAL, binaryPath)

    // 2. Check version and channel
    UI.println(UI.Style.TEXT_INFO_BOLD + "  Version:     ", UI.Style.TEXT_NORMAL, Installation.VERSION)
    UI.println(UI.Style.TEXT_INFO_BOLD + "  Channel:     ", UI.Style.TEXT_NORMAL, Installation.CHANNEL)

    // 3. Check git SHA (if available)
    const gitSha = typeof OPENHEI_GIT_SHA === "string" ? OPENHEI_GIT_SHA : null
    if (gitSha) {
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Git SHA:     ", UI.Style.TEXT_NORMAL, gitSha.slice(0, 8))
    } else {
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Git SHA:     ", UI.Style.TEXT_NORMAL, "(not available)")
    }

    // 4. Check dashboard directory
    const dashboardPaths = [
      process.env.OPENHEI_DASHBOARD_DIR,
      "./dashboard",
      "../../dashboard",
      path.join(path.dirname(binaryPath), "../dashboard"),
    ]

    let dashboardDir: string | null = null
    for (const p of dashboardPaths) {
      if (!p) continue
      try {
        const { existsSync } = await import("fs")
        if (existsSync(p)) {
          dashboardDir = p
          break
        }
      } catch {
        // continue
      }
    }

    if (dashboardDir) {
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Dashboard:   ", UI.Style.TEXT_NORMAL, dashboardDir)

      // 5. Check dashboard .build_sha
      const buildShaPath = path.join(dashboardDir, ".build_sha")
      try {
        const { existsSync, readFileSync } = await import("fs")
        if (existsSync(buildShaPath)) {
          const distSha = readFileSync(buildShaPath, "utf-8").trim()
          UI.println(UI.Style.TEXT_INFO_BOLD + "  Dist SHA:    ", UI.Style.TEXT_NORMAL, distSha.slice(0, 8))

          // Compare binary SHA with dist SHA
          if (gitSha && distSha !== gitSha) {
            UI.println("")
            UI.println(UI.Style.TEXT_WARNING_BOLD + "  WARNING: Binary SHA doesn't match Dist SHA!")
            UI.println(UI.Style.TEXT_WARNING_BOLD + "    Binary: ", UI.Style.TEXT_NORMAL, gitSha.slice(0, 8))
            UI.println(UI.Style.TEXT_WARNING_BOLD + "    Dist:   ", UI.Style.TEXT_NORMAL, distSha.slice(0, 8))
            hasErrors = true
          }
        } else {
          UI.println(UI.Style.TEXT_INFO_BOLD + "  Dist SHA:    ", UI.Style.TEXT_NORMAL, "(no .build_sha file)")
        }
      } catch {
        UI.println(UI.Style.TEXT_INFO_BOLD + "  Dist SHA:    ", UI.Style.TEXT_NORMAL, "(error reading)")
      }

      // 6. Check for built assets
      const indexHtml = path.join(dashboardDir, "index.html")
      try {
        const { existsSync } = await import("fs")
        if (existsSync(indexHtml)) {
          UI.println(UI.Style.TEXT_INFO_BOLD + "  Assets:      ", UI.Style.TEXT_NORMAL, "OK (index.html found)")
        } else {
          UI.println(UI.Style.TEXT_INFO_BOLD + "  Assets:      ", UI.Style.TEXT_WARNING_BOLD, "MISSING (no index.html)")
          hasErrors = true
        }
      } catch {
        UI.println(UI.Style.TEXT_INFO_BOLD + "  Assets:      ", UI.Style.TEXT_WARNING_BOLD, "ERROR checking")
        hasErrors = true
      }
    } else {
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Dashboard:   ", UI.Style.TEXT_WARNING_BOLD, "NOT FOUND")
      hasErrors = true
    }

    UI.empty()

    if (hasErrors) {
      UI.println(UI.Style.TEXT_WARNING_BOLD + "  Status: ISSUES FOUND")
      UI.empty()
      process.exit(1)
    } else {
      UI.println(UI.Style.TEXT_SUCCESS_BOLD + "  Status: OK")
      UI.empty()
      process.exit(0)
    }
  },
}
