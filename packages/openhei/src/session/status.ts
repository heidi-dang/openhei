import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Instance } from "@/project/instance"
import z from "zod"

export namespace SessionStatus {
  /**
   * Provider status severity levels
   */
  export type Severity = "info" | "warning" | "error" | "critical"

  /**
   * Standardized provider error codes
   */
  export type ProviderErrorCode =
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
   * Provider status information
   */
  export interface ProviderStatusInfo {
    /** Status type */
    type: "provider_status"
    /** Severity level */
    severity: Severity
    /** Standardized error code */
    code: ProviderErrorCode
    /** Human-readable message */
    message: string
    /** Additional technical details */
    details?: string
    /** Source provider ID */
    providerID: string
    /** Whether this status allows retry */
    retryable: boolean
    /** Timestamp when status was created */
    timestamp: number
    /** Optional retry count for retryable errors */
    retryAttempt?: number
    /** Optional next retry timestamp */
    nextRetryAt?: number
  }

  /**
   * Provider warning information
   */
  export interface ProviderWarningInfo {
    /** Status type */
    type: "provider_warning"
    /** Warning code */
    code: Exclude<ProviderErrorCode, "AUTH_FAILED" | "QUOTA_EXCEEDED" | "CONTEXT_OVERFLOW">
    /** Warning message */
    message: string
    /** Additional details */
    details?: string
    /** Source provider ID */
    providerID: string
    /** Timestamp */
    timestamp: number
  }

  export const Info = z
    .union([
      z.object({
        type: z.literal("idle"),
      }),
      z.object({
        type: z.literal("retry"),
        attempt: z.number(),
        message: z.string(),
        next: z.number(),
      }),
      z.object({
        type: z.literal("busy"),
        runId: z.string().optional(),
      }),
      z.object({
        type: z.literal("replay"),
        message: z.string().optional(),
      }),
      z.object({
        type: z.literal("resync_required"),
        message: z.string().optional(),
      }),
      // New provider status types
      z.object({
        type: z.literal("provider_error"),
        severity: z.enum(["error", "critical"]),
        code: z.enum([
          "AUTH_FAILED",
          "QUOTA_EXCEEDED",
          "RATE_LIMITED",
          "CONTEXT_OVERFLOW",
          "MODEL_UNAVAILABLE",
          "NETWORK_ERROR",
          "TIMEOUT",
          "INVALID_REQUEST",
          "SERVER_ERROR",
          "PROVIDER_OVERLOADED",
          "UNKNOWN_ERROR",
          "TOOL_NOT_SUPPORTED",
          "BILLING_ERROR",
        ]),
        message: z.string(),
        details: z.string().optional(),
        providerID: z.string(),
        retryable: z.boolean(),
        timestamp: z.number(),
        retryAttempt: z.number().optional(),
        nextRetryAt: z.number().optional(),
      }),
      z.object({
        type: z.literal("provider_warning"),
        code: z.enum(["RATE_LIMITED", "NETWORK_ERROR", "TIMEOUT", "PROVIDER_OVERLOADED", "MODEL_UNAVAILABLE"]),
        message: z.string(),
        details: z.string().optional(),
        providerID: z.string(),
        timestamp: z.number(),
      }),
      z.object({
        type: z.literal("provider_status"),
        severity: z.enum(["info", "warning"]),
        code: z.enum(["RATE_LIMITED", "NETWORK_ERROR", "TIMEOUT", "PROVIDER_OVERLOADED", "MODEL_UNAVAILABLE"]),
        message: z.string(),
        details: z.string().optional(),
        providerID: z.string(),
        retryable: z.boolean(),
        timestamp: z.number(),
      }),
    ])
    .meta({
      ref: "SessionStatus",
    })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Status: BusEvent.define(
      "session.status",
      z.object({
        sessionID: z.string(),
        status: Info,
      }),
    ),
    // deprecated
    Idle: BusEvent.define(
      "session.idle",
      z.object({
        sessionID: z.string(),
      }),
    ),
    // New event for provider status updates
    ProviderStatus: BusEvent.define(
      "session.provider_status",
      z.object({
        sessionID: z.string(),
        status: z.union([
          z.object({
            type: z.literal("provider_error"),
            severity: z.enum(["error", "critical"]),
            code: z.string(),
            message: z.string(),
            details: z.string().optional(),
            providerID: z.string(),
            retryable: z.boolean(),
            timestamp: z.number(),
          }),
          z.object({
            type: z.literal("provider_warning"),
            code: z.string(),
            message: z.string(),
            details: z.string().optional(),
            providerID: z.string(),
            timestamp: z.number(),
          }),
        ]),
      }),
    ),
  }

  const state = Instance.state(() => {
    const data: Record<string, Info> = {}
    return data
  })

  export function get(sessionID: string) {
    return (
      state()[sessionID] ?? {
        type: "idle",
      }
    )
  }

  export function list() {
    return state()
  }

  export function set(sessionID: string, status: Info) {
    Bus.publish(Event.Status, {
      sessionID,
      status,
    })
    if (status.type === "idle") {
      // deprecated
      Bus.publish(Event.Idle, {
        sessionID,
      })
      delete state()[sessionID]
      return
    }
    state()[sessionID] = status
  }

  /**
   * Set a provider error status
   */
  export function setProviderError(
    sessionID: string,
    params: {
      severity: "error" | "critical"
      code: ProviderErrorCode
      message: string
      details?: string
      providerID: string
      retryable: boolean
      retryAttempt?: number
      nextRetryAt?: number
    },
  ) {
    const status: Info = {
      type: "provider_error",
      ...params,
      timestamp: Date.now(),
    }
    set(sessionID, status)
    Bus.publish(Event.ProviderStatus, {
      sessionID,
      status: {
        type: "provider_error",
        severity: params.severity,
        code: params.code,
        message: params.message,
        details: params.details,
        providerID: params.providerID,
        retryable: params.retryable,
        timestamp: Date.now(),
      },
    })
  }

  /**
   * Set a provider warning status
   */
  export function setProviderWarning(
    sessionID: string,
    params: {
      code: Exclude<
        ProviderErrorCode,
        | "AUTH_FAILED"
        | "QUOTA_EXCEEDED"
        | "CONTEXT_OVERFLOW"
        | "BILLING_ERROR"
        | "INVALID_REQUEST"
        | "SERVER_ERROR"
        | "UNKNOWN_ERROR"
        | "TOOL_NOT_SUPPORTED"
      >
      message: string
      details?: string
      providerID: string
    },
  ) {
    const status: Info = {
      type: "provider_warning",
      ...params,
      timestamp: Date.now(),
    }
    set(sessionID, status)
    Bus.publish(Event.ProviderStatus, {
      sessionID,
      status: {
        type: "provider_warning",
        code: params.code,
        message: params.message,
        details: params.details,
        providerID: params.providerID,
        timestamp: Date.now(),
      },
    })
  }

  /**
   * Clear provider status (set back to idle or retry)
   */
  export function clearProviderStatus(
    sessionID: string,
    newStatus?: Exclude<Info, { type: "provider_error" | "provider_warning" | "provider_status" }>,
  ) {
    if (newStatus) {
      set(sessionID, newStatus)
    } else {
      set(sessionID, { type: "idle" })
    }
  }

  /**
   * Check if current status is a provider error
   */
  export function isProviderError(status: Info): boolean {
    return status.type === "provider_error"
  }

  /**
   * Check if current status is a provider warning
   */
  export function isProviderWarning(status: Info): boolean {
    return status.type === "provider_warning"
  }

  /**
   * Get display message for status
   */
  export function getDisplayMessage(status: Info): string | undefined {
    switch (status.type) {
      case "provider_error":
        return status.message
      case "provider_warning":
        return status.message
      case "retry":
        return status.message
      case "resync_required":
        return status.message
      default:
        return undefined
    }
  }
}
