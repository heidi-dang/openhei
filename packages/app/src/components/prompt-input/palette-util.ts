export function shouldOpenPalette(flagsEnabled: boolean, rawText: string) {
  if (!flagsEnabled) return { open: false, query: "" }
  const m = rawText.match(/^\/(\S*)/)
  if (!m) return { open: false, query: "" }
  return { open: true, query: m[1] ?? "" }
}

export function stripSlashPrefix(text: string, cmd: string) {
  return text.replace(new RegExp(`^/${cmd}\s?`), "").replace(/^\s+/, "")
}
