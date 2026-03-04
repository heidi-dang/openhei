import { APICallError } from "ai"
import { STATUS_CODES } from "http"
import { iife } from "@/util/iife"

export namespace ProviderError {
  /**
   * Standardized provider error codes
   */
  export type ErrorCode =
    | "AUTH_FAILED"
    | "QUOTA_EXCEEDED"
    | "RATE_LIMITED"
    | "CONTEXT_OVERFLOW"
    | "MODEL_UNAVAILABLE"
    | "NETWORK_ERROR"
    | "TIMEOUT"
    | "INVALID_REQUEST"
    | "SERVER_ERROR"
    | "PROVIDER_OVERLOADED"
    | "UNKNOWN_ERROR"
    | "TOOL_NOT_SUPPORTED"
    | "BILLING_ERROR"

  /**
   * Error severity levels
   */
  export type Severity = "info" | "warning" | "error" | "critical"

  /**
   * Standardized error info with code
   */
  export interface StandardizedError {
    code: ErrorCode
    severity: Severity
    message: string
    details?: string
    retryable: boolean
    originalError?: unknown
  }

  // Adapted from overflow detection patterns in:
  // https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/utils/overflow.ts
  const OVERFLOW_PATTERNS = [
    /prompt is too long/i, // Anthropic
    /input is too long for requested model/i, // Amazon Bedrock
    /exceeds the context window/i, // OpenAI (Completions + Responses API message text)
    /input token count.*exceeds the maximum/i, // Google (Gemini)
    /maximum prompt length is \d+/i, // xAI (Grok)
    /reduce the length of the messages/i, // Groq
    /maximum context length is \d+ tokens/i, // OpenRouter, DeepSeek
    /exceeds the limit of \d+/i, // GitHub Copilot
    /exceeds the available context size/i, // llama.cpp server
    /greater than the context length/i, // LM Studio
    /context window exceeds limit/i, // MiniMax
    /exceeded model token limit/i, // Kimi For Coding, Moonshot
    /context[_ ]length[_ ]exceeded/i, // Generic fallback
  ]

  /**
   * Authentication error patterns by provider
   */
  const AUTH_PATTERNS = [
    /invalid.*authentication/i,
    /incorrect.*api.*key/i,
    /unauthorized/i,
    /authentication.*failed/i,
    /invalid.*token/i,
    /expired.*token/i,
    /revoked/i,
  ]

  /**
   * Quota/billing error patterns
   */
  const QUOTA_PATTERNS = [
    /quota.*exceeded/i,
    /usage.*limit/i,
    /billing.*error/i,
    /payment.*required/i,
    /insufficient.*quota/i,
    /exceeded.*current.*quota/i,
    /free.*usage.*limit/i,
  ]

  /**
   * Rate limit patterns
   */
  const RATE_LIMIT_PATTERNS = [
    /rate.*limit/i,
    /too.*many.*requests/i,
    /throttl/i,
  ]

  /**
   * Network error patterns
   */
  const NETWORK_PATTERNS = [
    /network.*error/i,
    /connection.*refused/i,
    /connection.*reset/i,
    /econnrefused/i,
    /econnreset/i,
    /etimeout/i,
    /etimedout/i,
    /ENOTFOUND/i,
    /ECONNREFUSED/i,
    /ECONNRESET/i,
    /ETIMEDOUT/i,
  ]

  /**
   * Model unavailable patterns
   */
  const MODEL_UNAVAILABLE_PATTERNS = [
    /model.*not.*found/i,
    /model.*unavailable/i,
    /no.*endpoints.*found/i,
    /model.*does.*not.*exist/i,
    /invalid.*model/i,
  ]

  /**
   * Server error patterns
   */
  const SERVER_ERROR_PATTERNS = [
    /internal.*server.*error/i,
    /bad.*gateway/i,
    /service.*unavailable/i,
    /gateway.*timeout/i,
  ]

  /**
   * Tool not supported patterns
   */
  const TOOL_NOT_SUPPORTED_PATTERNS = [
    /no.*endpoints.*found.*that.*support.*tool/i,
    /tool.*use.*not.*supported/i,
    /function.*calling.*not.*supported/i,
  ]

  function isOpenAiErrorRetryable(e: APICallError) {
    const status = e.statusCode
    if (!status) return e.isRetryable
    // openai sometimes returns 404 for models that are actually available
    return status === 404 || e.isRetryable
  }

  // Providers not reliably handled in this function:
  // - z.ai: can accept overflow silently (needs token-count/context-window checks)
  function isOverflow(message: string) {
    if (OVERFLOW_PATTERNS.some((p) => p.test(message))) return true

    // Providers/status patterns handled outside of regex list:
    // - Cerebras: often returns "400 (no body)" / "413 (no body)"
    // - Mistral: often returns "400 (no body)" / "413 (no body)"
    return /^4(00|13)\s*(status code)?\s*\(no body\)/i.test(message)
  }

  /**
   * Detect error code from message and status
   */
  export function detectErrorCode(message: string, statusCode?: number): ErrorCode {
    const lowerMsg = message.toLowerCase()

    // Check patterns in order of specificity
    if (OVERFLOW_PATTERNS.some((p) => p.test(message))) {
      return "CONTEXT_OVERFLOW"
    }

    if (AUTH_PATTERNS.some((p) => p.test(lowerMsg))) {
      return "AUTH_FAILED"
    }

    if (QUOTA_PATTERNS.some((p) => p.test(lowerMsg))) {
      return "QUOTA_EXCEEDED"
    }

    if (TOOL_NOT_SUPPORTED_PATTERNS.some((p) => p.test(lowerMsg))) {
      return "TOOL_NOT_SUPPORTED"
    }

    if (RATE_LIMIT_PATTERNS.some((p) => p.test(lowerMsg))) {
      return "RATE_LIMITED"
    }

    if (MODEL_UNAVAILABLE_PATTERNS.some((p) => p.test(lowerMsg))) {
      return "MODEL_UNAVAILABLE"
    }

    if (NETWORK_PATTERNS.some((p) => p.test(message))) {
      return "NETWORK_ERROR"
    }

    if (SERVER_ERROR_PATTERNS.some((p) => p.test(lowerMsg))) {
      return "SERVER_ERROR"
    }

    // Check status codes
    if (statusCode) {
      if (statusCode === 401) return "AUTH_FAILED"
      if (statusCode === 403) return "AUTH_FAILED"
      if (statusCode === 429) return "RATE_LIMITED"
      if (statusCode === 404) return "MODEL_UNAVAILABLE"
      if (statusCode === 408) return "TIMEOUT"
      if (statusCode === 413) return "CONTEXT_OVERFLOW"
      if (statusCode >= 500) return "SERVER_ERROR"
      if (statusCode >= 400) return "INVALID_REQUEST"
    }

    return "UNKNOWN_ERROR"
  }

  /**
   * Get severity for error code
   */
  export function getSeverity(code: ErrorCode): Severity {
    switch (code) {
      case "AUTH_FAILED":
      case "QUOTA_EXCEEDED":
      case "BILLING_ERROR":
        return "critical"
      case "CONTEXT_OVERFLOW":
      case "TOOL_NOT_SUPPORTED":
        return "error"
      case "RATE_LIMITED":
      case "TIMEOUT":
      case "NETWORK_ERROR":
        return "warning"
      case "MODEL_UNAVAILABLE":
      case "SERVER_ERROR":
      case "PROVIDER_OVERLOADED":
        return "warning"
      case "INVALID_REQUEST":
      case "UNKNOWN_ERROR":
        return "error"
      default:
        return "error"
    }
  }

  /**
   * Check if error is retryable based on code
   */
  export function isRetryable(code: ErrorCode): boolean {
    switch (code) {
      case "RATE_LIMITED":
      case "TIMEOUT":
      case "NETWORK_ERROR":
      case "SERVER_ERROR":
      case "PROVIDER_OVERLOADED":
      case "MODEL_UNAVAILABLE":
        return true
      case "AUTH_FAILED":
      case "QUOTA_EXCEEDED":
      case "BILLING_ERROR":
      case "CONTEXT_OVERFLOW":
      case "TOOL_NOT_SUPPORTED":
      case "INVALID_REQUEST":
      case "UNKNOWN_ERROR":
        return false
      default:
        return false
    }
  }

  /**
   * Get user-friendly message for error code
   */
  export function getUserMessage(code: ErrorCode, providerID: string, originalMessage?: string): string {
    switch (code) {
      case "AUTH_FAILED":
        return `Authentication failed for ${providerID}. Please check your API key or re-authenticate.`
      case "QUOTA_EXCEEDED":
        return `Usage quota exceeded for ${providerID}. Please check your plan and billing details.`
      case "BILLING_ERROR":
        return `Billing error with ${providerID}. Please update your payment information.`
      case "RATE_LIMITED":
        return `Rate limit reached for ${providerID}. Please wait a moment before retrying.`
      case "CONTEXT_OVERFLOW":
        return `Input too long for ${providerID} model. Please reduce the message length or start a new session.`
      case "TOOL_NOT_SUPPORTED":
        return `Selected model on ${providerID} doesn't support tools. Try a different model or enable simple chat mode.`
      case "MODEL_UNAVAILABLE":
        return `Model unavailable on ${providerID}. The model may be temporarily down or doesn't exist.`
      case "NETWORK_ERROR":
        return `Network error connecting to ${providerID}. Please check your internet connection.`
      case "TIMEOUT":
        return `Request to ${providerID} timed out. The server may be slow or overloaded.`
      case "SERVER_ERROR":
        return `${providerID} server error. The provider may be experiencing issues.`
      case "PROVIDER_OVERLOADED":
        return `${providerID} is currently overloaded. Please try again later.`
      case "INVALID_REQUEST":
        return `Invalid request to ${providerID}. Please try again or contact support.`
      case "UNKNOWN_ERROR":
        return originalMessage
          ? `Error from ${providerID}: ${originalMessage}`
          : `An unknown error occurred with ${providerID}.`
      default:
        return originalMessage || `Error from ${providerID}`
    }
  }

  /**
   * Standardize an error to consistent format
   */
  export function standardize(
    providerID: string,
    error: APICallError | Error | unknown,
  ): StandardizedError {
    if (APICallError.isInstance(error)) {
      const code = detectErrorCode(error.message, error.statusCode)
      const severity = getSeverity(code)
      const retryable = isRetryable(code) || (providerID.startsWith("openai") ? isOpenAiErrorRetryable(error) : error.isRetryable)
      
      return {
        code,
        severity,
        message: getUserMessage(code, providerID, error.message),
        details: error.responseBody || error.message,
        retryable,
        originalError: error,
      }
    }

    if (error instanceof Error) {
      const code = detectErrorCode(error.message)
      return {
        code,
        severity: getSeverity(code),
        message: getUserMessage(code, providerID, error.message),
        details: error.stack,
        retryable: isRetryable(code),
        originalError: error,
      }
    }

    // Unknown error type
    return {
      code: "UNKNOWN_ERROR",
      severity: "error",
      message: getUserMessage("UNKNOWN_ERROR", providerID, String(error)),
      details: JSON.stringify(error),
      retryable: false,
      originalError: error,
    }
  }

  function error(providerID: string, error: APICallError) {
    if (providerID.includes("github-copilot") && error.statusCode === 403) {
      return "Please reauthenticate with the copilot provider to ensure your credentials work properly with OpenHei."
    }

    // Handle OpenRouter 404 "No endpoints found that support tool use" error
    if (providerID === "openrouter" && error.statusCode === 404) {
      const errorBody = error.responseBody ? JSON.parse(error.responseBody) : null
      const errorMessage = errorBody?.error?.message || error.message || ""

      if (errorMessage.includes("No endpoints found that support tool use")) {
        return "Selected model/routing has no tool-capable endpoints. Switch to a tool-capable model, remove provider.only/order constraints, or enable simple chat mode. Learn more: https://openrouter.ai/docs/guides/routing/provider-selection"
      }
    }

    return error.message
  }

  function message(providerID: string, e: APICallError) {
    return iife(() => {
      const msg = e.message
      if (msg === "") {
        if (e.responseBody) return e.responseBody
        if (e.statusCode) {
          const err = STATUS_CODES[e.statusCode]
          if (err) return err
        }
        return "Unknown error"
      }

      const transformed = error(providerID, e)
      if (transformed !== msg) {
        return transformed
      }
      if (!e.responseBody || (e.statusCode && msg !== STATUS_CODES[e.statusCode])) {
        return msg
      }

      try {
        const body = JSON.parse(e.responseBody)
        // try to extract common error message fields
        const errMsg = body.message || body.error || body.error?.message
        if (errMsg && typeof errMsg === "string") {
          return `${msg}: ${errMsg}`
        }
      } catch {}

      return `${msg}: ${e.responseBody}`
    }).trim()
  }

  function json(input: unknown) {
    if (typeof input === "string") {
      try {
        const result = JSON.parse(input)
        if (result && typeof result === "object") return result
        return undefined
      } catch {
        return undefined
      }
    }
    if (typeof input === "object" && input !== null) {
      return input
    }
    return undefined
  }

  export type ParsedStreamError =
    | {
        type: "context_overflow"
        message: string
        responseBody: string
      }
    | {
        type: "api_error"
        message: string
        isRetryable: boolean
        responseBody: string
      }

  export function parseStreamError(input: unknown): ParsedStreamError | undefined {
    const body = json(input)
    if (!body) return

    const responseBody = JSON.stringify(body)
    if (body.type !== "error") return

    switch (body?.error?.code) {
      case "context_length_exceeded":
        return {
          type: "context_overflow",
          message: "Input exceeds context window of this model",
          responseBody,
        }
      case "insufficient_quota":
        return {
          type: "api_error",
          message: "Quota exceeded. Check your plan and billing details.",
          // Streamed provider errors are best treated as non-retryable by default
          // (avoid retry storms from service-side quota signals). Tests expect
          // non-retryable for these response-stream error codes.
          isRetryable: false,
          responseBody,
        }
      case "usage_not_included":
        return {
          type: "api_error",
          message: "To use Codex with your ChatGPT plan, upgrade to Plus: https://chatgpt.com/explore/plus.",
          // Treat this as non-retryable for streamed error messages.
          isRetryable: false,
          responseBody,
        }
      case "invalid_prompt":
        return {
          type: "api_error",
          message: typeof body?.error?.message === "string" ? body?.error?.message : "Invalid prompt.",
          isRetryable: false,
          responseBody,
        }
    }
  }

  export type ParsedAPICallError =
    | {
        type: "context_overflow"
        message: string
        responseBody?: string
      }
    | {
        type: "api_error"
        message: string
        statusCode?: number
        isRetryable: boolean
        responseHeaders?: Record<string, string>
        responseBody?: string
        metadata?: Record<string, string>
      }

  export function parseAPICallError(input: { providerID: string; error: APICallError }): ParsedAPICallError {
    const m = message(input.providerID, input.error)
    if (isOverflow(m)) {
      return {
        type: "context_overflow",
        message: m,
        responseBody: input.error.responseBody,
      }
    }

    const metadata = input.error.url ? { url: input.error.url } : undefined
    return {
      type: "api_error",
      message: m,
      statusCode: input.error.statusCode,
      isRetryable:
        /quota|billing|limit|rate/i.test(m) ||
        (input.providerID.startsWith("openai") ? isOpenAiErrorRetryable(input.error) : input.error.isRetryable),
      responseHeaders: input.error.responseHeaders,
      responseBody: input.error.responseBody,
      metadata,
    }
  }
}
