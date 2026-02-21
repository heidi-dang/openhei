import { describe, it, expect } from "bun:test"
import { findLast } from "../src/array"

describe("findLast", () => {
  it("returns the last matching element", () => {
    const items = [1, 2, 3, 4, 5, 2]
    const result = findLast(items, (item) => item === 2)
    expect(result).toBe(2)
  })

  it("returns undefined if no element matches", () => {
    const items = [1, 3, 5]
    const result = findLast(items, (item) => item === 2)
    expect(result).toBeUndefined()
  })

  it("handles empty arrays", () => {
    const items: number[] = []
    const result = findLast(items, (item) => item === 2)
    expect(result).toBeUndefined()
  })

  it("passes correct arguments to predicate", () => {
    const items = ["a", "b", "c"]
    const indices: number[] = []
    findLast(items, (item, index, arr) => {
      indices.push(index)
      expect(arr).toBe(items)
      return false
    })
    expect(indices).toEqual([2, 1, 0])
  })

  it("searches from the end", () => {
    const items = [
      { id: 1, val: "a" },
      { id: 2, val: "b" },
      { id: 3, val: "a" },
    ]
    const result = findLast(items, (item) => item.val === "a")
    expect(result).toEqual({ id: 3, val: "a" })
  })
})
