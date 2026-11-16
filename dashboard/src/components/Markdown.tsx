import type { ReactNode } from 'react'

// Minimal, safe markdown for topic descriptions: paragraphs, "- " bullet lists,
// **bold**, `code` and [links](https://...). Builds React nodes — no raw HTML.

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="bg-border text-[#c4b5fd] px-1 rounded text-[12px]">{part.slice(1, -1)}</code>
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/)
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noopener" className="text-accent hover:underline">{link[1]}</a>
    return part
  })
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/)
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        if (lines.every(l => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc pl-5 mb-2 space-y-0.5">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*]\s+/, ''))}</li>)}
            </ul>
          )
        }
        return <p key={i} className="mb-2 last:mb-0">{inline(lines.join(' '))}</p>
      })}
    </>
  )
}
