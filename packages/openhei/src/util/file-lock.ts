import { open, mkdir, stat, unlink, writeFile } from "fs/promises"
import { constants } from "fs"
import { Global } from "../global"
import path from "path"
import { Log } from "../util/log"

const log = Log.create({ service: "file-lock" })

const LOCK_TIMEOUT_MS = 30000

export namespace FileLock {
  export class LockError extends Error {
    constructor(
      message: string,
      public readonly heldBy: string | null,
    ) {
      super(message)
      this.name = "LockError"
    }
  }

  export async function acquire(name: string, timeout = LOCK_TIMEOUT_MS): Promise<() => Promise<void>> {
    const lockDir = path.join(Global.Path.state, "locks")
    const lockPath = path.join(lockDir, `${name}.lock`)

    await mkdir(lockDir, { recursive: true })

    const start = Date.now()
    let fd: any = null

    while (true) {
      try {
        fd = await open(lockPath, "wx", 0o600)
        break
      } catch (err: any) {
        if (err.code !== "EEXIST") throw err

        const age =
          Date.now() -
          (await stat(lockPath)
            .catch(() => ({ mtimeMs: 0 }))
            .then((s) => s.mtimeMs))
        if (age > timeout) {
          const pid = await Bun.file(lockPath)
            .text()
            .catch(() => "unknown")
          throw new LockError(`Lock ${name} held for too long (>${timeout}ms) by: ${pid}`, pid)
        }

        if (Date.now() - start > timeout) {
          const pid = await Bun.file(lockPath)
            .text()
            .catch(() => "unknown")
          throw new LockError(`Lock ${name} acquire timeout after ${timeout}ms, held by: ${pid}`, pid)
        }

        await Bun.sleep(100)
      }
    }

    await writeFile(lockPath, `${process.pid}`)

    log.debug("lock acquired", { name, path: lockPath })

    return async () => {
      try {
        await fd.close()
        await unlink(lockPath)
        log.debug("lock released", { name })
      } catch (err) {
        log.warn("lock release error", { name, error: err })
      }
    }
  }
}
