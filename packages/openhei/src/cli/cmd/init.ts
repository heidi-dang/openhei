import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { Init } from "../../init"
import { EOL } from "os"

export const InitCommand = cmd({
  command: "init",
  describe: "initialize openhei (create database, run migrations)",
  builder: (yargs: Argv) => {
    return yargs
      .option("force", {
        type: "boolean",
        describe: "force re-initialization",
        default: false,
      })
      .option("migrate", {
        type: "boolean",
        describe: "force JSON->SQLite migration",
        default: false,
      })
  },
  handler: async (args: { force: boolean; migrate: boolean }) => {
    if (args.force) {
      console.log("Force re-initialization requested")
    }

    const wasInitialized = Init.isInitialized()
    const result = await Init.run({ forceMigrate: args.migrate || args.force })

    if (result.migrated) {
      console.log("Migration complete")
    } else if (wasInitialized) {
      console.log("Already initialized")
    } else {
      console.log("Initialization complete")
    }

    console.log(`Database: ${Init.Path.db}`)
    process.exit(0)
  },
})
