import { describe, expect, test } from "bun:test"
import { checksum } from "../src/encode"

describe("util.encode", () => {
  describe("checksum", () => {
    test("should return undefined for empty string", () => {
      expect(checksum("")).toBeUndefined()
    })

    test("should return consistent checksum for same input", () => {
      const input = "hello world"
      const result1 = checksum(input)
      const result2 = checksum(input)
      expect(result1).toBe(result2)
      expect(result1).toBeDefined()
    })

    test("should return different checksum for different input", () => {
      const input1 = "hello"
      const input2 = "world"
      expect(checksum(input1)).not.toBe(checksum(input2))
    })

    test("should handle unicode characters", () => {
      const input = "👋 🌍"
      const result = checksum(input)
      expect(result).toBeDefined()
      expect(result).toBe("1iifj14")
    })

    test("should match known checksum for 'test'", () => {
      expect(checksum("test")).toBe("1cs5qlh")
    })
  })
})
