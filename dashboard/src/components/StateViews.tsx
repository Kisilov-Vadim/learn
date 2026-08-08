import type { ReactNode } from 'react'

// Shared centered card used by both empty and error states.
function Shell({ icon, title, message, children }: { icon: string; title: string; message: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center rounded-xl border border-border bg-surface/40 py-16 px-6">
      <div className="text-5xl mb-4 opacity-80" aria-hidden>{icon}</div>
      <h3 className="text-white font-semibold text-lg mb-1.5">{title}</h3>
      <p className="text-dim text-sm max-w-sm mb-5">{message}</p>
      {children}
    </div>
  )
}

export function EmptyState({
  icon, title, message, action,
}: { icon: string; title: string; message: string; action?: ReactNode }) {
  return <Shell icon={icon} title={title} message={message}>{action}</Shell>
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <Shell icon="⚠️" title="Couldn't load" message={message || 'Something went wrong fetching your data.'}>
      <button
        onClick={onRetry}
        className="rounded-lg bg-accent2 text-white text-sm font-medium px-4 py-2 hover:brightness-110 transition-all"
      >
        ↻ Refresh
      </button>
    </Shell>
  )
}
