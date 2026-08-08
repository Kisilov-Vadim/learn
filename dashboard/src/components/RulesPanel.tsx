import { useEffect, useState } from 'react'
import { useRules } from '../hooks/useRules'
import type { Rule } from '../types'

interface Props {
  // null = global rules; otherwise the subject's rules
  subjectId: string | null
  title?: string
}

export function RulesPanel({ subjectId, title }: Props) {
  const { rules, loading, add, update, remove } = useRules(subjectId)
  // null = modal closed; 'new' = create mode; a Rule = edit mode
  const [editing, setEditing] = useState<Rule | 'new' | null>(null)

  const heading = title ?? (subjectId ? 'Subject rules' : 'Global rules')

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-white font-semibold text-lg">{heading}</h2>
        <button
          onClick={() => setEditing('new')}
          className="rounded-lg bg-accent2 text-white text-sm font-medium px-3.5 py-1.5 hover:brightness-110 transition-all"
        >
          + Add rule
        </button>
      </div>
      <p className="text-dim text-sm mb-4">
        {subjectId
          ? 'Applied only when studying this subject.'
          : 'Applied to every subject, every session.'}
      </p>

      {loading && rules.length === 0 ? (
        <div className="text-dim text-sm py-4">Loading…</div>
      ) : rules.length === 0 ? (
        <div className="text-faint text-sm py-4">No rules yet.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map(r => (
            <div
              key={r.id}
              className={`bg-bg rounded-lg px-3.5 py-2.5 flex items-center gap-3 ${r.active ? '' : 'opacity-50'}`}
            >
              <button
                onClick={() => update(r.id, { active: !r.active })}
                title={r.active ? 'Disable' : 'Enable'}
                className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${r.active ? 'bg-accent2' : 'bg-border2'}`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${r.active ? 'left-[18px]' : 'left-0.5'}`}
                />
              </button>
              <button
                onClick={() => setEditing(r)}
                className="flex-1 text-left text-[14px] font-medium text-white hover:text-accent transition-colors truncate"
              >
                {r.label}
              </button>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <RuleModal
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onCreate={async (label, text) => { await add(label, text); setEditing(null) }}
          onSave={async (id, text) => { await update(id, { text }); setEditing(null) }}
          onDelete={async (id) => { await remove(id); setEditing(null) }}
        />
      )}
    </div>
  )
}

function RuleModal({
  rule,
  onClose,
  onCreate,
  onSave,
  onDelete,
}: {
  rule: Rule | null // null = create mode
  onClose: () => void
  onCreate: (label: string, text: string) => Promise<void>
  onSave: (id: string, text: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const isNew = rule === null
  const [label, setLabel] = useState(rule?.label ?? '')
  const [text, setText] = useState(rule?.text ?? '')
  const [busy, setBusy] = useState(false)

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const canSave = isNew ? label.trim().length > 0 : true

  async function save() {
    if (busy || !canSave) return
    setBusy(true)
    try {
      if (isNew) await onCreate(label.trim(), text)
      else await onSave(rule!.id, text)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border2 rounded-2xl w-full max-w-lg p-6 relative"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          title="Close"
          className="absolute top-4 right-4 text-dim hover:text-white transition-colors text-lg"
        >
          ✕
        </button>

        {isNew ? (
          <input
            autoFocus
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Rule label (e.g. “Examples”)"
            className="w-full bg-bg border border-border2 rounded-lg text-lg font-semibold px-3.5 py-2.5 mb-4 outline-none text-white placeholder:text-faint focus:border-accent transition-colors"
          />
        ) : (
          <h3 className="text-white font-semibold text-xl mb-4 pr-8">{rule!.label}</h3>
        )}

        <label className="block text-dim text-sm mb-1.5">Description</label>
        <textarea
          autoFocus={!isNew}
          value={text}
          onChange={e => setText(e.target.value)}
          rows={5}
          placeholder="What should the assistant do? (optional)"
          className="w-full bg-bg border border-border2 rounded-lg text-[15px] px-3.5 py-2.5 outline-none text-white placeholder:text-faint focus:border-accent transition-colors resize-y"
        />

        <div className="flex items-center gap-2 mt-5">
          {!isNew && (
            <button
              onClick={() => onDelete(rule!.id)}
              className="text-red-400 hover:text-red-300 text-sm mr-auto"
            >
              Delete
            </button>
          )}
          <button
            onClick={onClose}
            className={`text-dim hover:text-white text-sm px-4 py-2 ${isNew ? 'ml-auto' : ''}`}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave || busy}
            className="rounded-lg bg-accent2 text-white text-sm font-medium px-4 py-2 disabled:opacity-40 hover:brightness-110 transition-all"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
