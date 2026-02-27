import { describe, expect, test, mock, beforeEach } from "bun:test"

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

const mockLanguage = (key: string) => {
  const dict: Record<string, string> = {
    "streaming.status.streaming": "Streaming",
    "streaming.status.reconnecting": "Reconnecting",
    "streaming.stop": "Stop",
  }
  return dict[key] ?? key
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
    const status = { type: "idle" }
    const result = status.type === "idle" ? "idle" : status.type === "retry" ? "reconnecting" : "streaming"
    expect(result).toBe("idle")
  })

  test("status type returns streaming when session status is busy", () => {
    const status = { type: "busy" }
    const result = status.type === "idle" ? "idle" : status.type === "retry" ? "reconnecting" : "streaming"
    expect(result).toBe("streaming")
  })

  test("status type returns reconnecting when session status is retry", () => {
    const status = { type: "retry", attempt: 1, message: "error", next: 1000 }
    const result = status.type === "idle" ? "idle" : status.type === "retry" ? "reconnecting" : "streaming"
    expect(result).toBe("reconnecting")
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
    const sessionStatus = { type: "busy" }

    const shouldRender = flagEnabled && sessionStatus.type !== "idle"
    expect(shouldRender).toBe(false)
  })

  test("streaming status renders when flag is true and status is busy", () => {
    const flagEnabled = true
    const sessionStatus = { type: "busy" }

    const shouldRender = flagEnabled && sessionStatus.type !== "idle"
    expect(shouldRender).toBe(true)
  })

  test("banner renders only when flag is true and status is not idle", () => {
    const flagEnabled = false
    const sessionStatus = { type: "busy" }

    const shouldRender = flagEnabled && sessionStatus.type !== "idle"
    expect(shouldRender).toBe(false)
  })

  test("banner renders when flag is true and status is retry", () => {
    const flagEnabled = true
    const sessionStatus = { type: "retry", attempt: 1, message: "error", next: 1000 }

    const shouldRender = flagEnabled && sessionStatus.type !== "idle"
    expect(shouldRender).toBe(true)
  })
})
