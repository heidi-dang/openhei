import { test, expect, describe } from "bun:test"
import path from "path"
import fs from "fs/promises"
import os from "os"
import { File } from "../../src/file"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

describe("File.read symlink protection", () => {
  test("rejects symlink pointing outside project", async () => {
    // 1. Create a secret file outside the project
    const secretDir = await fs.mkdtemp(path.join(os.tmpdir(), "secret-"))
    const secretFile = path.join(secretDir, "secret.txt")
    await Bun.write(secretFile, "secret content")

    // 2. Create project directory
    await using tmp = await tmpdir({
      init: async (dir) => {
        // 3. Create a symlink inside project pointing to secret file
        await fs.symlink(secretFile, path.join(dir, "link-to-secret.txt"))
      },
    })

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // 4. Try to read the symlink
          // If vulnerable, it reads content. If fixed, it throws.
          await expect(File.read("link-to-secret.txt")).rejects.toThrow("Access denied: path escapes project directory")
        },
      })
    } finally {
      await fs.rm(secretDir, { recursive: true, force: true })
    }
  })
})
