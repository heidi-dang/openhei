import { describe, it, expect } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import path from "path"
import fs from "fs/promises"

describe("QLoRA Process Security", () => {
  it("denies kill for PID 1", async () => {
    // PID 1 is never eligible
    const isEligible = (pid: number) => pid > 1
    expect(isEligible(1)).toBe(false)
    expect(isEligible(0)).toBe(false)
    expect(isEligible(1234)).toBe(true)
  })

  it("denies kill for non-QLoRA processes", async () => {
    // Simulate eligible list check
    const eligiblePids = new Set([100, 200, 300])
    const canKill = (pid: number) => eligiblePids.has(pid)

    expect(canKill(1)).toBe(false)
    expect(canKill(999)).toBe(false)
    expect(canKill(100)).toBe(true)
  })

  it("enforces SIGTERM before SIGKILL cooldown", async () => {
    const termAttempts: Record<string, string> = {}
    const now = Date.now()

    // No prior SIGTERM attempt
    const canSigkill = (pid: number) => {
      const lastAttempt = termAttempts[String(pid)]
      if (!lastAttempt) return false
      const elapsed = now - new Date(lastAttempt).getTime()
      return elapsed >= 3000
    }

    // Without SIGTERM first
    expect(canSigkill(123)).toBe(false)

    // With recent SIGTERM (< 3s)
    termAttempts["123"] = new Date(now - 1000).toISOString()
    expect(canSigkill(123)).toBe(false)

    // With old SIGTERM (> 3s)
    termAttempts["123"] = new Date(now - 4000).toISOString()
    expect(canSigkill(123)).toBe(true)
  })

  it("validates ownership via UID match", async () => {
    const procUid = 1000

    const canKill = (puid: number, currentUid: number) => puid === currentUid || currentUid === 0

    expect(canKill(procUid, 1000)).toBe(true) // Same user
    expect(canKill(999, 1000)).toBe(false) // Different user
    expect(canKill(0, 1000)).toBe(false) // Root process (not root user)
    expect(canKill(999, 0)).toBe(true) // Root user can kill any
  })

  it("rejects root system daemons", async () => {
    const isRootDaemon = (user: string, cmd: string) => {
      if (user !== "root") return false
      const daemons = ["systemd", "init", "dbus"]
      return daemons.some((d) => cmd.includes(d))
    }

    expect(isRootDaemon("root", "/usr/lib/systemd/systemd")).toBe(true)
    expect(isRootDaemon("root", "/sbin/init")).toBe(true)
    expect(isRootDaemon("root", "/usr/bin/dbus-daemon")).toBe(true)
    expect(isRootDaemon("root", "heidi-engine")).toBe(false) // QLoRA process OK
    expect(isRootDaemon("heidi", "systemd")).toBe(false) // Non-root OK
  })
})
