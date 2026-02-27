import { Server } from "../../server/server"
import { UI } from "../ui"
import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "../../flag/flag"
import { Installation } from "../../installation"
import open from "open"
import { networkInterfaces } from "os"

function getNetworkIPs() {
  const nets = networkInterfaces()
  const results: string[] = []

  for (const name of Object.keys(nets)) {
    const net = nets[name]
    if (!net) continue

    for (const netInfo of net) {
      // Skip internal and non-IPv4 addresses
      if (netInfo.internal || netInfo.family !== "IPv4") continue

      // Skip Docker bridge networks (typically 172.x.x.x)
      if (netInfo.address.startsWith("172.")) continue

      results.push(netInfo.address)
    }
  }

  return results
}

export const WebCommand = cmd({
  command: "web",
  builder: (yargs) =>
    withNetworkOptions(yargs).option("debug", {
      type: "boolean" as const,
      describe: "print debug information including dist path and build SHA",
      default: false,
    }),
  describe: "start openhei server and open web interface",
  handler: async (args) => {
    const debugMode = args.debug ?? false

    if (debugMode) {
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Debug Info:", UI.Style.TEXT_NORMAL)
      UI.println(UI.Style.TEXT_INFO_BOLD + "    Version:       ", UI.Style.TEXT_NORMAL, Installation.VERSION)
      UI.println(UI.Style.TEXT_INFO_BOLD + "    Channel:       ", UI.Style.TEXT_NORMAL, Installation.CHANNEL)

      // Try to determine dashboard path
      const possibleDashPaths = [process.env.OPENHEI_DASHBOARD_DIR, "./dashboard", "../../dashboard"].filter(Boolean)

      for (const p of possibleDashPaths) {
        try {
          const { existsSync } = await import("fs")
          if (p && existsSync(p)) {
            UI.println(UI.Style.TEXT_INFO_BOLD + "    Dashboard Dir: ", UI.Style.TEXT_NORMAL, p)
            break
          }
        } catch {}
      }
      UI.empty()
    }

    if (!Flag.OPENHEI_SERVER_PASSWORD) {
      UI.println(UI.Style.TEXT_WARNING_BOLD + "!  " + "OPENHEI_SERVER_PASSWORD is not set; server is unsecured.")
    }
    const opts = await resolveNetworkOptions(args)
    const server = Server.listen(opts)
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()

    const shouldOpen = process.env.OPENHEI_NO_OPEN !== "1"

    if (opts.hostname === "0.0.0.0") {
      // Show localhost for local access
      const localhostUrl = `http://localhost:${server.port}`
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Local access:      ", UI.Style.TEXT_NORMAL, localhostUrl)

      // Show network IPs for remote access
      const networkIPs = getNetworkIPs()
      if (networkIPs.length > 0) {
        for (const ip of networkIPs) {
          UI.println(
            UI.Style.TEXT_INFO_BOLD + "  Network access:    ",
            UI.Style.TEXT_NORMAL,
            `http://${ip}:${server.port}`,
          )
        }
      }

      if (opts.mdns) {
        UI.println(
          UI.Style.TEXT_INFO_BOLD + "  mDNS:              ",
          UI.Style.TEXT_NORMAL,
          `${opts.mdnsDomain}:${server.port}`,
        )
      }

      if (shouldOpen) {
        // Open localhost in browser
        open(localhostUrl.toString()).catch(() => {})
      }
    } else {
      const displayUrl = server.url.toString()
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Web interface:    ", UI.Style.TEXT_NORMAL, displayUrl)
      if (shouldOpen) {
        open(displayUrl).catch(() => {})
      }
    }

    await new Promise(() => {})
    await server.stop()
  },
})
