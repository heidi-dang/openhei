import { semver } from "bun"
import path from "path"

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}

const env = {
  OPENHEI_CHANNEL: process.env["OPENHEI_CHANNEL"],
  OPENHEI_BUMP: process.env["OPENHEI_BUMP"],
  OPENHEI_VERSION: process.env["OPENHEI_VERSION"],
  OPENHEI_RELEASE: process.env["OPENHEI_RELEASE"],
}

const root = path.dirname(rootPkgPath)
const GIT_SHA = await (async () => {
  if (env.OPENHEI_VERSION) {
    const shaPath = path.join(root, ".git/SHA")
    if (await Bun.file(shaPath).exists()) {
      return (await Bun.file(shaPath).text()).trim()
    }
  }
  return "unknown"
})()

const BUILD_TIME = new Date().toISOString()

const CHANNEL = await (async () => {
  if (env.OPENHEI_CHANNEL) return env.OPENHEI_CHANNEL
  if (env.OPENHEI_BUMP) return "latest"
  if (env.OPENHEI_VERSION && !env.OPENHEI_VERSION.startsWith("0.0.0-")) return "latest"
  const head = await Bun.file(path.join(root, ".git/HEAD"))
    .text()
    .catch(() => "")
  const ref = head.startsWith("ref: ") ? head.slice("ref: ".length).trim() : ""
  if (ref.startsWith("refs/heads/")) return ref.slice("refs/heads/".length)
  return "dev"
})()
const IS_PREVIEW = CHANNEL !== "latest"

const VERSION = await (async () => {
  if (env.OPENHEI_VERSION) return env.OPENHEI_VERSION
  if (IS_PREVIEW) return `0.0.0-${CHANNEL}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
  const version = await fetch("https://registry.npmjs.org/openhei-ai/latest")
    .then((res) => {
      if (!res.ok) throw new Error(res.statusText)
      return res.json()
    })
    .then((data: unknown) => {
      if (!data || typeof data !== "object") {
        throw new Error("Invalid npm registry response")
      }
      const version = (data as { version?: unknown }).version
      if (typeof version !== "string") {
        throw new Error("Invalid npm registry version")
      }
      return version
    })
  const [major, minor, patch] = version.split(".").map((x: string) => Number(x) || 0)
  const t = env.OPENHEI_BUMP?.toLowerCase()
  if (t === "major") return `${major + 1}.0.0`
  if (t === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
})()

const team = [
  "actions-user",
  "openhei",
  "rekram1-node",
  "thdxr",
  "kommander",
  "jayair",
  "fwang",
  "MrMushrooooom",
  "adamdotdevin",
  "iamdavidhill",
  "Brendonovich",
  "nexxeln",
  "Hona",
  "jlongster",
  "openhei-agent[bot]",
  "R44VC0RP",
]

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release(): boolean {
    return !!env.OPENHEI_RELEASE
  },
  get team() {
    return team
  },
  get gitSha() {
    return GIT_SHA
  },
  get buildTime() {
    return BUILD_TIME
  },
}
console.log(`openhei script`, JSON.stringify(Script, null, 2))
