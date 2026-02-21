import { marked } from "marked"
import { codeToHtml } from "shiki"
import markedShiki from "marked-shiki"
import DOMPurify from "dompurify"
import { createOverflow, useShareMessages } from "./common"
import { CopyButton } from "./copy-button"
import { createResource, createSignal } from "solid-js"
import style from "./content-markdown.module.css"

const markedWithShiki = marked.use(
  {
    renderer: {
      link({ href, title, text }) {
        const titleAttr = title ? ` title="${title}"` : ""
        return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`
      },
    },
  },
  markedShiki({
    highlight(code, lang) {
      return codeToHtml(code, {
        lang: lang || "text",
        themes: {
          light: "github-light",
          dark: "github-dark",
        },
      })
    },
  }),
)

export async function parseAndSanitizeMarkdown(markdown: string): Promise<string> {
  const html = await markedWithShiki.parse(markdown)

  let purifyInstance: any = DOMPurify

  if (typeof DOMPurify.sanitize !== "function") {
    // It's likely a factory
    let win: any = typeof window !== "undefined" ? window : undefined

    if (!win) {
      // Server-side
      const { Window } = await import("happy-dom")
      const virtualWindow = new Window()
      win = virtualWindow
    }

    if (typeof DOMPurify === "function") {
      purifyInstance = (DOMPurify as any)(win)
    }
  }

  if (purifyInstance && typeof purifyInstance.sanitize === "function") {
    return purifyInstance.sanitize(html, { ADD_ATTR: ["target"] })
  }

  // Fail safe
  return ""
}

interface Props {
  text: string
  expand?: boolean
  highlight?: boolean
}
export function ContentMarkdown(props: Props) {
  const [html] = createResource(() => strip(props.text), parseAndSanitizeMarkdown)
  const [expanded, setExpanded] = createSignal(false)
  const overflow = createOverflow()
  const messages = useShareMessages()

  return (
    <div
      class={style.root}
      data-highlight={props.highlight === true ? true : undefined}
      data-expanded={expanded() || props.expand === true ? true : undefined}
    >
      <div data-slot="markdown" ref={overflow.ref} innerHTML={html()} />

      {!props.expand && overflow.status && (
        <button
          type="button"
          data-component="text-button"
          data-slot="expand-button"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded() ? messages.show_less : messages.show_more}
        </button>
      )}
      <CopyButton text={props.text} />
    </div>
  )
}

function strip(text: string): string {
  const wrappedRe = /^\s*<([A-Za-z]\w*)>\s*([\s\S]*?)\s*<\/\1>\s*$/
  const match = text.match(wrappedRe)
  return match ? match[2] : text
}
