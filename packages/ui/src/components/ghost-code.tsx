import { Component, For, createMemo } from "solid-js"
import "./ghost-code.css"

export interface GhostCodeProps {
  lines?: number
  class?: string
}

export const GhostCode: Component<GhostCodeProps> = (props) => {
  const count = () => props.lines ?? 5
  if (count() <= 0) return null

  const generatedLines = createMemo(() => {
    const lines = []
    let currentIndent = 0

    for (let i = 0; i < count(); i++) {
      if (i > 0 && Math.random() > 0.6) currentIndent = Math.min(currentIndent + 1, 3)
      else if (i > 0 && Math.random() > 0.8) currentIndent = Math.max(currentIndent - 1, 0)

      if (i === count() - 1) currentIndent = 0

      lines.push({
        indent: currentIndent,
        width: 30 + Math.random() * 50,
      })
    }
    return lines
  })

  return (
    <div class={`ghost-code-container ${props.class || ""}`} data-component="ghost-code">
      <For each={generatedLines()}>
        {(line) => (
          <div class="ghost-code-line" style={{ "padding-left": `${line.indent * 20}px` }}>
            <div class="ghost-code-rect" style={{ width: `${line.width}%` }}></div>
          </div>
        )}
      </For>
    </div>
  )
}

export default GhostCode
