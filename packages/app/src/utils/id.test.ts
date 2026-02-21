import { describe, test, expect } from "bun:test";
import { Identifier } from "./id";

// Helper to manipulate global crypto
const originalCrypto = globalThis.crypto;

describe("Identifier security check", () => {

  test("generates ID with crypto available", () => {
    const id = Identifier.ascending("session");
    expect(id).toBeString();
    expect(id.startsWith("ses_")).toBe(true);
  });

  test("throws error when secure crypto is missing", () => {
    // Mock crypto to be undefined
    // @ts-ignore
    globalThis.crypto = undefined;

    try {
        expect(() => Identifier.ascending("session")).toThrow();
    } finally {
      // Restore crypto
      // @ts-ignore
      globalThis.crypto = originalCrypto;
    }
  });
});
