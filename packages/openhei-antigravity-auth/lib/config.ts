import fs from "fs"
import path from "path"

const CONFIG_PATH = path.join(process.env.HOME || ".", ".config", "openhei", "antigravity.json")

export async function getConfig() {
  try {
    const raw = await fs.promises.readFile(CONFIG_PATH, "utf-8")
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export async function saveConfig(cfg: any) {
  const dir = path.dirname(CONFIG_PATH)
  await fs.promises.mkdir(dir, { recursive: true })
  await fs.promises.writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8")
}
