export function shouldOpenPalette(flag: boolean, text: string) {
  if (!flag) return { open: false }
  if (!text) return { open: false }
  return { open: text.startsWith("/") }
}

export function stripSlashPrefix(text: string, cmd: string) {
  const prefix = `/${cmd}`
  if (!text.startsWith(prefix)) return text
  let rest = text.slice(prefix.length)
  if (rest.startsWith(" ")) rest = rest.slice(1)
  return rest
}
