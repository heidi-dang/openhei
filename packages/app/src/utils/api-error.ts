export function isNotFoundError(err: unknown): err is { name: "NotFoundError"; data?: { message?: string } } {
  return !!err && typeof err === "object" && "name" in err && (err as { name?: unknown }).name === "NotFoundError"
}
