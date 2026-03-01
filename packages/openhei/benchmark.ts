import { Session } from "./src/session"
import { Instance } from "./src/project/instance"
import { Database } from "./src/storage/db"
import { Identifier } from "./src/id/id"
import { performance } from "perf_hooks"

async function runBenchmark() {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      // Create a root session
      const rootSession = await Session.create({})

      console.log("Creating 100 child sessions...")
      // Create 100 child sessions sequentially (or concurrently)
      const children = []
      for (let i = 0; i < 100; i++) {
        children.push(Session.create({ parentID: rootSession.id }))
      }
      await Promise.all(children)

      console.log("Measuring remove performance...")
      const start = performance.now()

      await Session.remove(rootSession.id)

      const end = performance.now()
      console.log(`Removal took ${end - start} ms`)
    }
  })
}

runBenchmark().catch(console.error)
