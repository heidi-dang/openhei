export namespace WorkflowRoute {
  const line = /^ROUTE:NEXT=([^\s#]+)\s*$/gm

  export function parse(text: string): string | undefined {
    let last: string | undefined
    for (const match of text.matchAll(line)) last = match[1]
    return last
  }

  export function set(text: string, next: string): string {
    const trimmed = text.replaceAll(/^ROUTE:NEXT=[^\n]*\n?/gm, "").trimEnd()
    const suffix = trimmed.length ? "\n" : ""
    return `${trimmed}${suffix}\nROUTE:NEXT=${next}\n`
  }
}
