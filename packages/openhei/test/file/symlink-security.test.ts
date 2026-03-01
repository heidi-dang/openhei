import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { Filesystem } from "../../src/util/filesystem";
import { mkdir, symlink, rm, writeFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Filesystem.contains security", () => {
  const tmpDir = join(tmpdir(), "openhei-test-" + Math.random().toString(36).slice(2));
  const projectDir = join(tmpDir, "project");
  const outsideDir = join(tmpDir, "outside");

  test("symlink escape should be blocked", async () => {
    await mkdir(projectDir, { recursive: true });
    await mkdir(outsideDir, { recursive: true });
    await writeFile(join(outsideDir, "secret.txt"), "secret data");

    // Create a symlink inside project pointing to outside
    // linkPath -> outsideDir
    const linkPath = join(projectDir, "link-to-outside");
    // Ensure symlink doesn't exist before creating
    try { await rm(linkPath); } catch {}
    await symlink(outsideDir, linkPath);

    const secretPathLexical = join(linkPath, "secret.txt");

    // Lexically, secretPathLexical starts with projectDir
    // But it resolves to outsideDir/secret.txt

    // Check existing file
    expect(Filesystem.contains(projectDir, secretPathLexical)).toBe(false);

    // Check non-existent file through symlink
    // This tests the fallback logic in Filesystem.contains
    const nonExistentPath = join(linkPath, "newfile.txt");
    expect(Filesystem.contains(projectDir, nonExistentPath)).toBe(false);

    // Check normal file inside project
    const normalPath = join(projectDir, "normal.txt");
    await writeFile(normalPath, "normal");
    expect(Filesystem.contains(projectDir, normalPath)).toBe(true);

    // Clean up
    await rm(tmpDir, { recursive: true, force: true });
  });
});
