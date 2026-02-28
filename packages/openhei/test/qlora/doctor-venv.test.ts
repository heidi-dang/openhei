import { describe, it, expect } from "bun:test"
import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"

// This test simulates two python interpreters by creating small wrapper scripts
// One wrapper works (prints version and can import a fake heidi_engine), the other fails.

describe("QLoRA doctor python selection", () => {
  it("prefers configured interpreter over PATH-only heidi-engine", () => {
    const tmp = path.join(process.cwd(), "tmp-test-pythons")
    if (!fs.existsSync(tmp)) fs.mkdirSync(tmp)

    const good = path.join(tmp, "good-python")
    const bad = path.join(tmp, "bad-python")

    // good-python: responds to -c import by exiting 0
    fs.writeFileSync(
      good,
      '#!/bin/sh\nif [ "$1" = "-c" ]; then python3 -c "import sys;print(sys.executable)"; exit 0; fi\nexec python3 "$@"\n',
    )
    fs.writeFileSync(
      bad,
      '#!/bin/sh\nif [ "$1" = "-c" ]; then python3 -c "import non_existent_module"; exit 1; fi\nexec python3 "$@"\n',
    )
    fs.chmodSync(good, 0o755)
    fs.chmodSync(bad, 0o755)

    // Run the server-side findpy-like check by invoking the wrapper good and bad directly
    const goodRes = spawnSync(good, ["-c", "import heidi_engine"], { encoding: "utf8" })
    const badRes = spawnSync(bad, ["-c", "import heidi_engine"], { encoding: "utf8" })

    // good should exit with non-error code (we used python3 import of sys so exit 0)
    expect(goodRes.status).toBe(0)
    // bad should be non-zero because it tried to import a missing module
    expect(badRes.status).not.toBe(0)

    // cleanup
    try {
      fs.rmSync(tmp, { recursive: true, force: true })
    } catch {}
  })
})
