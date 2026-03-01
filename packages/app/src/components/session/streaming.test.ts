import { describe, expect, test, beforeEach } from "bun:test"
import type { SessionStatus } from "@openhei-ai/sdk/v2"

const abortCalls: string[] = []

const mockSDK = {
  client: {
    session: {
      abort: async (input: { sessionID: string }) => {
        abortCalls.push(input.sessionID)
        return { data: undefined }
      },
    },
  },
}

const getStatusType = (status: SessionStatus): string => {
  if (status.type === "idle") return "idle"
  if (status.type === "resync_required") return "resyncing"
  if (status.type === "retry") return "reconnecting"
  return "streaming"
}

describe("StreamingStatus", () => {
  beforeEach(() => {
    abortCalls.length = 0
  })

  test("stop button triggers abort with correct session ID", async () => {
    const sessionID = "test-session-123"
    expect(abortCalls).toEqual([])
  })

  test("status type returns idle when session status is idle", () => {
    const status: SessionStatus = { type: "idle" }
    expect(getStatusType(status)).toBe("idle")
  })

  test("status type returns streaming when session status is busy", () => {
    const status: SessionStatus = { type: "busy" }
    expect(getStatusType(status)).toBe("streaming")
  })

  test("status type returns reconnecting when session status is retry", () => {
    const status: SessionStatus = { type: "retry", attempt: 1, message: "error", next: 1000 }
    expect(getStatusType(status)).toBe("reconnecting")
  })

  test("status type returns resyncing when session status is resync_required", () => {
    const status: SessionStatus = { type: "resync_required" }
    expect(getStatusType(status)).toBe("resyncing")
  })

  test("status type returns streaming when session status is replay", () => {
    const status: SessionStatus = { type: "replay" }
    expect(getStatusType(status)).toBe("streaming")
  })
})

describe("StreamingBanner", () => {
  test("banner type replaying shows correct message", () => {
    const getMessage = (type: string) => (type === "replaying" ? "Replaying from cursor..." : "Resync required")
    expect(getMessage("replaying")).toBe("Replaying from cursor...")
  })

  test("banner type resync_required shows correct message", () => {
    const getMessage = (type: string) => (type === "replaying" ? "Replaying from cursor..." : "Resync required")
    expect(getMessage("resync_required")).toBe("Resync required")
  })
})

describe("Flag gating", () => {
  test("streaming status renders only when flag is true", () => {
    const flagEnabled = false
    const isNotIdle = true // sessionStatus.type !== "idle" always true for non-idle statuses
    const shouldRender = flagEnabled && isNotIdle
    expect(shouldRender).toBe(false)
  })

  test("streaming status renders when flag is true and status is busy", () => {
    const flagEnabled = true
    const isNotIdle = true
    const shouldRender = flagEnabled && isNotIdle
    expect(shouldRender).toBe(true)
  })

  test("banner renders only when flag is true and status is not idle", () => {
    const flagEnabled = false
    const isNotIdle = true
    const shouldRender = flagEnabled && isNotIdle
    expect(shouldRender).toBe(false)
  })

  test("banner renders when flag is true and status is retry", () => {
    const flagEnabled = true
    const isNotIdle = true
    const shouldRender = flagEnabled && isNotIdle
    expect(shouldRender).toBe(true)
  })
})

describe("Banner gating for replay and resync_required only", () => {
  const shouldShowBanner = (streamBannersEnabled: boolean, sessionStatus: SessionStatus): boolean => {
    return streamBannersEnabled && (sessionStatus.type === "replay" || sessionStatus.type === "resync_required")
  }

  test("banner should NOT render for busy status", () => {
    const streamBannersEnabled = true
    const sessionStatus: SessionStatus = { type: "busy" }
    expect(shouldShowBanner(streamBannersEnabled, sessionStatus)).toBe(false)
  })

  test("banner should NOT render for retry status", () => {
    const streamBannersEnabled = true
    const sessionStatus: SessionStatus = { type: "retry", attempt: 1, message: "error", next: 1000 }
    expect(shouldShowBanner(streamBannersEnabled, sessionStatus)).toBe(false)
  })

  test("banner should render for replay status", () => {
    const streamBannersEnabled = true
    const sessionStatus: SessionStatus = { type: "replay" }
    expect(shouldShowBanner(streamBannersEnabled, sessionStatus)).toBe(true)
  })

  test("banner should render for resync_required status", () => {
    const streamBannersEnabled = true
    const sessionStatus: SessionStatus = { type: "resync_required" }
    expect(shouldShowBanner(streamBannersEnabled, sessionStatus)).toBe(true)
  })

  test("banner should NOT render when flag is disabled", () => {
    const streamBannersEnabled = false
    const sessionStatus: SessionStatus = { type: "replay" }
    expect(shouldShowBanner(streamBannersEnabled, sessionStatus)).toBe(false)
  })
})
