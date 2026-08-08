import { useEffect, useState } from 'react'
import { useRules } from '../hooks/useRules'
import { EmptyState, ErrorState } from './StateViews'
import type { Rule } from '../types'

interface Props {
  // null = global rules; otherwise the subject's rules
  subjectId: string | null
  title?: string
}

// Shared pill toggle used by both the list row and the modal.
function Switch({ active, onToggle, title }: { active: boolean; onToggle: () => void; title?: string }) {
  return (
    <button
      onClick={onToggle}
      title={title ?? (active ? 'Disable' : 'Enable')}
      className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${active ? 'bg-accent2' : 'bg-border2'}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${active ? 'left-[18px]' : 'left-0.5'}`}
      />
    </button>
  )
}

export function RulesPanel({ subjectId, title }: Props) {
  const { rules, loading, error, add, update, remove, reload } = useRules(subjectId)
  // null = modal closed; 'new' = create mode; a Rule = edit mode
  const [editing, setEditing] = useState<Rule | 'new' | null>(null)
  // id of the row currently showing its inline delete confirm (null = none)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

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

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && rules.length === 0 ? (
        <div className="text-dim text-sm py-4">Loading…</div>
      ) : rules.length === 0 ? (
        <EmptyState
          icon="◈"
          title="No rules yet"
          message="Add a rule to steer how sessions run."
          action={
            <button
              onClick={() => setEditing('new')}
              className="rounded-lg bg-accent2 text-white text-sm font-medium px-4 py-2 hover:brightness-110 transition-all"
            >
              + Add rule
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map(r => (
            <div
              key={r.id}
              className={`bg-bg rounded-lg px-3.5 py-2.5 flex items-center gap-3 ${r.active ? '' : 'opacity-50'}`}
            >
              <Switch active={r.active} onToggle={() => update(r.id, { active: !r.active })} />
              <button
                onClick={() => setEditing(r)}
                className="flex-1 text-left text-[14px] font-medium text-white hover:text-accent transition-colors truncate"
              >
                {r.label}
              </button>
              {confirmingId === r.id ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[12px] text-muted">Delete?</span>
                  <button
                    onClick={() => { remove(r.id); setConfirmingId(null) }}
                    className="text-[12px] font-medium text-red-400 hover:text-red-300 px-1.5 py-0.5"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmingId(null)}
                    className="text-[12px] text-dim hover:text-white px-1.5 py-0.5"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingId(r.id)}
                  title="Delete rule"
                  className="shrink-0 text-dim hover:text-red-400 transition-colors text-sm px-1"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <RuleModal
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onCreate={async (label, text, active) => { await add(label, text, active); setEditing(null) }}
          onSave={async (id, label, text, active) => { await update(id, { label, text, active }); setEditing(null) }}
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
  onCreate: (label: string, text: string, active: boolean) => Promise<void>
  onSave: (id: string, label: string, text: string, active: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const isNew = rule === null
  const [label, setLabel] = useState(rule?.label ?? '')
  const [text, setText] = useState(rule?.text ?? '')
  const [active, setActive] = useState(rule?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const canSave = label.trim().length > 0

  // The switch edits form state only; nothing persists until Save, so Cancel/Escape
  // discards a toggle just like it discards label/description edits.
  async function save() {
    if (busy || !canSave) return
    setBusy(true)
    try {
      if (isNew) await onCreate(label.trim(), text, active)
      else await onSave(rule!.id, label.trim(), text, active)
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

        <label className="block text-dim text-sm mb-1.5">Label</label>
        <input
          autoFocus
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Rule label (e.g. “Examples”)"
          className="w-full bg-bg border border-border2 rounded-lg text-lg font-semibold px-3.5 py-2.5 mb-4 outline-none text-white placeholder:text-faint focus:border-accent transition-colors"
        />

        <label className="block text-dim text-sm mb-1.5">Description</label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={5}
          placeholder="What should the assistant do? (optional)"
          className="w-full bg-bg border border-border2 rounded-lg text-[15px] px-3.5 py-2.5 outline-none text-white placeholder:text-faint focus:border-accent transition-colors resize-y"
        />

        <div className="flex items-center gap-2.5 mt-4">
          <Switch active={active} onToggle={() => setActive(a => !a)} />
          <span className="text-sm text-muted">{active ? 'Active' : 'Disabled'}</span>
        </div>

        <div className="flex items-center gap-2 mt-5">
          {confirmingDelete ? (
            <>
              <span className="text-sm text-muted mr-auto">Delete this rule?</span>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="text-dim hover:text-white text-sm px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={() => { if (!busy) { setBusy(true); onDelete(rule!.id) } }}
                disabled={busy}
                className="rounded-lg bg-red-500/90 text-white text-sm font-medium px-4 py-2 disabled:opacity-40 hover:bg-red-500 transition-colors"
              >
                Delete
              </button>
            </>
          ) : (
            <>
              {!isNew && (
                <button
                  onClick={() => setConfirmingDelete(true)}
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
