import { addTurnLog } from "../hooks/use-turn-logs"

export async function sendWithRetries({ client, body, sessionID, messageID, maxRetries = 3 }: any) {
  const baseDelayMs = 2000

  let attempt = 0
  while (true) {
    try {
      attempt++
      await client.session.promptAsync(body)
      return
    } catch (err: any) {
      const status = err?.status ?? err?.data?.status ?? err?.data?.statusCode ?? err?.statusCode
      const code = Number(status)
      const is429 = code === 429
      const is5xx = code >= 500 && code < 600

      try {
        addTurnLog(
          sessionID,
          messageID,
          is429 ? "rate_limit" : is5xx ? "backend_500" : "error",
          String(err?.data?.message ?? err?.message ?? err),
        )
      } catch (e) {}

      if ((is429 || is5xx) && attempt <= maxRetries) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), 60000)
        try {
          addTurnLog(sessionID, messageID, "retry_scheduled", `attempt=${attempt} delay_ms=${delay}`)
        } catch (e) {}
        await new Promise((res) => setTimeout(res, delay))
        try {
          addTurnLog(sessionID, messageID, "retry_fired", `attempt=${attempt}`)
        } catch (e) {}
        continue
      }

      try {
        addTurnLog(sessionID, messageID, "retry_failed", `attempt=${attempt} exhausted`)
      } catch (e) {}
      throw err
    }
  }
}
