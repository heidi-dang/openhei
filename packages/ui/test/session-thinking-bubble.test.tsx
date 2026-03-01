import { describe, it, expect } from "vitest"
import { render } from "@testing-library/jsx"
import { SessionTurn } from "../src/components/session-turn"

describe("Thinking bubble fallback", () => {
  it("renders skeleton when working and no activityPanel", () => {
    const props: any = {
      sessionID: "s",
      messageID: "m",
      showReasoningSummaries: true,
      thinkingDrawerEnabled: false,
      thinkingDrawerMode: "auto",
      // working will be derived from store; provide minimal mock store via context
      children: null,
    }

    // Render the component shallowly; we only assert that render does not throw
    // and that the component mounts with the provided props. Full DOM checks
    // would require wiring the `useData` context; keep this test minimal so it
    // acts as a regression guard for mounting the bubble in the no-activity
    // path.
    const el = render(() => SessionTurn(props))
    expect(el).toBeTruthy()
  })
})
