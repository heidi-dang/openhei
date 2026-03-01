import fs from "fs/promises"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"
import path from "path"
import os from "os"
import { Filesystem } from "../util/filesystem"

const app = "openhei"

function resolveDataDir(): string {
  if (process.env.OPENHEI_DATA_DIR) return process.env.OPENHEI_DATA_DIR
  const xdg = xdgData
  if (xdg) return path.join(xdg, app)
  const realHome = process.env.HOME?.replace(/^\/home\/[^\/]+/, "/home/heidi") || "/home/heidi"
  return path.join(realHome, ".local", "share", app)
}

function resolveConfigDir(): string {
  if (process.env.OPENHEI_CONFIG_DIR) return process.env.OPENHEI_CONFIG_DIR
  const xdg = xdgConfig
  if (xdg) return path.join(xdg, app)
  const realHome = process.env.HOME?.replace(/^\/home\/[^\/]+/, "/home/heidi") || "/home/heidi"
  return path.join(realHome, ".config", app)
}

function resolveStateDir(): string {
  if (process.env.OPENHEI_STATE_DIR) return process.env.OPENHEI_STATE_DIR
  const xdg = xdgState
  if (xdg) return path.join(xdg, app)
  const realHome = process.env.HOME?.replace(/^\/home\/[^\/]+/, "/home/heidi") || "/home/heidi"
  return path.join(realHome, ".local", "state", app)
}

const data = resolveDataDir()
const config = resolveConfigDir()
const state = resolveStateDir()
const cache = path.join(xdgCache!, app)

export namespace Global {
  export const Path = {
    get home() {
      if (process.env.OPENHEI_TEST_HOME) return process.env.OPENHEI_TEST_HOME
      const envHome = process.env.HOME
      if (envHome?.startsWith("/home/heidi/snap/") || envHome?.startsWith("/snap/")) {
        return "/home/heidi"
      }
      return envHome || "/home/heidi"
    },
    data,
    bin: path.join(data, "bin"),
    log: path.join(data, "log"),
    cache,
    config,
    state,
  }
}

await Promise.all([
  fs.mkdir(Global.Path.data, { recursive: true }),
  fs.mkdir(Global.Path.config, { recursive: true }),
  fs.mkdir(Global.Path.state, { recursive: true }),
  fs.mkdir(Global.Path.log, { recursive: true }),
  fs.mkdir(Global.Path.bin, { recursive: true }),
])

const CACHE_VERSION = "21"

const version = await Filesystem.readText(path.join(Global.Path.cache, "version")).catch(() => "0")

if (version !== CACHE_VERSION) {
  try {
    const contents = await fs.readdir(Global.Path.cache)
    await Promise.all(
      contents.map((item) =>
        fs.rm(path.join(Global.Path.cache, item), {
          recursive: true,
          force: true,
        }),
      ),
    )
  } catch (e) {}
  await Filesystem.write(path.join(Global.Path.cache, "version"), CACHE_VERSION)
}
