import { describe, test, expect } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { Filesystem } from "../../src/util/filesystem"

describe("filesystem", () => {
  describe("contains()", () => {
    test("returns true for child inside parent", async () => {
      const tmp = await fs.mkdtemp("/tmp/test-filesystem-")
      try {
        const parent = path.join(tmp, "parent")
        await fs.mkdir(parent)
        const child = path.join(parent, "child.txt")
        await fs.writeFile(child, "content")
        expect(Filesystem.contains(parent, child)).toBe(true)
      } finally {
        await fs.rm(tmp, { recursive: true, force: true })
      }
    })

    test("returns false for parent outside", async () => {
      const tmp = await fs.mkdtemp("/tmp/test-filesystem-")
      try {
        const parent = path.join(tmp, "parent")
        await fs.mkdir(parent)
        const outside = path.join(tmp, "outside.txt")
        await fs.writeFile(outside, "content")
        expect(Filesystem.contains(parent, outside)).toBe(false)
      } finally {
        await fs.rm(tmp, { recursive: true, force: true })
      }
    })

    test("returns true for parent itself", async () => {
      const tmp = await fs.mkdtemp("/tmp/test-filesystem-")
      try {
        const parent = path.join(tmp, "parent")
        await fs.mkdir(parent)
        expect(Filesystem.contains(parent, parent)).toBe(true)
      } finally {
        await fs.rm(tmp, { recursive: true, force: true })
      }
    })

    test("returns false for path traversal attempt", async () => {
      const tmp = await fs.mkdtemp("/tmp/test-filesystem-")
      try {
        const parent = path.join(tmp, "parent")
        await fs.mkdir(parent)
        const outside = path.join(tmp, "outside.txt")
        await fs.writeFile(outside, "content")
        const traversal = path.join(parent, "..", "outside.txt")
        expect(Filesystem.contains(parent, traversal)).toBe(false)
      } finally {
        await fs.rm(tmp, { recursive: true, force: true })
      }
    })

    test("returns false for symlink pointing outside (vulnerability check)", async () => {
      const tmp = await fs.mkdtemp("/tmp/test-filesystem-")
      try {
        const parent = path.join(tmp, "project")
        await fs.mkdir(parent)

        const outside = path.join(tmp, "outside")
        await fs.mkdir(outside)
        const secret = path.join(outside, "secret.txt")
        await fs.writeFile(secret, "secret")

        const link = path.join(parent, "link")
        await fs.symlink(outside, link)

        // accessing project/link/secret.txt -> outside/secret.txt
        const child = path.join(link, "secret.txt")

        // Should return false because the resolved path is outside the parent
        expect(Filesystem.contains(parent, child)).toBe(false)
      } finally {
        await fs.rm(tmp, { recursive: true, force: true })
      }
    })
  })
})
