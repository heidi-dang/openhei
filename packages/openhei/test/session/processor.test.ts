import { describe, expect, test, mock, beforeAll } from "bun:test"
import { SessionProcessor } from "../../src/session/processor"
import { MessageV2 } from "../../src/session/message-v2"
import { Session } from "../../src/session"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { Identifier } from "../../src/id/id"
import { LLM } from "../../src/session/llm"
import { APICallError } from "ai"

// Mock LLM.stream to throw a context overflow error
mock.module("../../src/session/llm", () => {
  return {
    LLM: {
      stream: async () => {
        const error = new APICallError({
            message: "exceeds the context window",
            url: "http://localhost",
            requestBody: "{}",
            responseBody: "{}",
            statusCode: 400,
            responseHeaders: {},
        })
        throw error
      },
    },
  }
})

describe("SessionProcessor", () => {
  test("handles context overflow error by returning 'compact'", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const sessionID = session.id
        const assistantMessage = await Session.updateMessage({
          id: Identifier.ascending("message"),
          sessionID,
          role: "assistant",
          agent: "test",
          mode: "test",
          modelID: "gpt-4",
          providerID: "openai",
          parentID: "parent-id",
          path: { cwd: "/", root: "/" },
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          time: { created: Date.now() },
        }) as MessageV2.Assistant

        const processor = SessionProcessor.create({
          assistantMessage,
          sessionID,
          model: {
            id: "gpt-4",
            providerID: "openai",
            api: { id: "openai", npm: "@ai-sdk/openai" },
            capabilities: {},
            options: {},
          } as any,
          abort: new AbortController().signal,
        })

        const result = await processor.process({
            user: {} as any,
            sessionID,
            model: {} as any,
            agent: {} as any,
            system: [],
            abort: new AbortController().signal,
            messages: [],
            tools: {},
        })

        // Expected behavior after fix: returns "compact".
        expect(result).toBe("compact")

        // Also verify the message has the context overflow error set
        expect(assistantMessage.error).toBeDefined()
        expect(MessageV2.ContextOverflowError.isInstance(assistantMessage.error)).toBe(true)
      },
    })
  })
})
