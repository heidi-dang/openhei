import { Database as BunDatabase } from "bun:sqlite"
import { Global } from "./global"
import { Filesystem } from "./util/filesystem"
import { FileLock } from "./util/file-lock"
import { Log } from "./util/log"
import { JsonMigration } from "./storage/json-migration"
import path from "path"
import { existsSync, chmodSync } from "fs"

const log = Log.create({ service: "init" })

export namespace Init {
  const MARKER_FILE = ".initialized"

  export function isInitialized(): boolean {
    return existsSync(path.join(Global.Path.data, MARKER_FILE))
  }

  export const Path = {
    data: Global.Path.data,
    db: path.join(Global.Path.data, "openhei.db"),
    marker: path.join(Global.Path.data, MARKER_FILE),
  }

  async function setPermissions() {
    try {
      chmodSync(Global.Path.data, 0o700)
      const dbPath = path.join(Global.Path.data, "openhei.db")
      if (existsSync(dbPath)) {
        chmodSync(dbPath, 0o600)
      }
    } catch (err) {
      log.warn("failed to set permissions", { error: err })
    }
  }

  export async function run(options?: { forceMigrate?: boolean }): Promise<{
    initialized: boolean
    migrated: boolean
  }> {
    const release = await FileLock.acquire("init")
    try {
      const alreadyInit = isInitialized()
      if (alreadyInit && !options?.forceMigrate) {
        log.info("already initialized, skipping")
        await setPermissions()
        return { initialized: true, migrated: false }
      }

      log.info("initializing openhei")

      await setPermissions()

      await setPermissions()

      const markerPath = path.join(Global.Path.data, MARKER_FILE)
      const dbPath = path.join(Global.Path.data, "openhei.db")

      const storageDir = path.join(Global.Path.data, "storage")
      const hasLegacyData = existsSync(storageDir)

      if (hasLegacyData) {
        log.info("running JSON to SQLite migration")
        const sqlite = new BunDatabase(dbPath)
        try {
          const stats = await JsonMigration.run(sqlite)
          log.info("migration complete", stats)
        } finally {
          sqlite.close()
        }
      } else {
        const sqlite = new BunDatabase(dbPath, { create: true })
        sqlite.close()
        log.info("created new database")
      }

      await Filesystem.write(markerPath, new Date().toISOString())

      await setPermissions()

      log.info("initialization complete")
      return { initialized: true, migrated: hasLegacyData }
    } finally {
      await release()
    }
  }
}
