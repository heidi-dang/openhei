import { describe, it, expect } from "bun:test"
import { parseToolParams } from "../../src/cli/cmd/debug/agent.ts"

describe("parseToolParams", () => {
  it("should parse valid JSON", () => {
    const input = '{"a": 1}'
    expect(parseToolParams(input)).toEqual({ a: 1 })
  })

  it("should parse loose JSON (JSON5)", () => {
    const input = "{a: 1}"
    expect(parseToolParams(input)).toEqual({ a: 1 })
  })

  it("should NOT execute arbitrary code", () => {
    const input = "(function(){ console.log('pwned'); return {a:1}; })()"
    expect(() => parseToolParams(input)).toThrow()
  })

  it("should throw on invalid JSON", () => {
    const input = "{a: 1,"
    expect(() => parseToolParams(input)).toThrow()
  })

  it("should handle empty input", () => {
    expect(parseToolParams("")).toEqual({})
    expect(parseToolParams(undefined)).toEqual({})
  })
})
