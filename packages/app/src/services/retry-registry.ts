type Handler = () => Promise<void> | void

const registry = new Map<string, Handler>()

export function setRetryHandler(key: string, handler: Handler) {
  registry.set(key, handler)
}

export function getRetryHandler(key: string): Handler | undefined {
  return registry.get(key)
}

export function deleteRetryHandler(key: string) {
  registry.delete(key)
}

export function clearRetryHandlers() {
  registry.clear()
}

// expose on globalThis so UI code (which may not import this module)
// can still attempt to invoke handlers as a fallback
try {
  ;(globalThis as any).__retry_handlers = (globalThis as any).__retry_handlers || registry
} catch (e) {}
