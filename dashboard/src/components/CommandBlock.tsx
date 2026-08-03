import { useState } from 'react'

interface Props {
  command: string
  label?: string
  /** Text shown before the command, e.g. a shell prompt. Pass '' to omit (e.g. for a plain URL). */
  prefix?: string
}

export function CommandBlock({ command, label, prefix = '$ ' }: Props) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable (e.g. insecure context) — silently ignore
    }
  }

  return (
    <div>
      {label && <p className="text-dim text-xs mb-1.5">{label}</p>}
      <div className="flex items-center gap-2 bg-bg border border-border2 rounded-lg pl-4 pr-2 py-2.5">
        <code className="flex-1 text-[13px] text-muted font-mono whitespace-pre overflow-x-auto">
          {prefix && <span className="text-faint select-none">{prefix}</span>}{command}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-md bg-surface hover:bg-border2 text-dim hover:text-white transition-colors"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
