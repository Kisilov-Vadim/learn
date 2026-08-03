import type { Subject } from '../types'
import { InstallButton } from './InstallButton'

interface Props {
  subjects: Subject[]
  onSelect: (id: string) => void
  onLogout: () => void
}

export function SubjectCards({ subjects, onSelect, onLogout }: Props) {
  return (
    <div className="min-h-screen bg-bg px-12 pt-10 pb-12">
      <div className="flex justify-between items-center mb-8">
        <div className="text-accent text-2xl font-bold tracking-tight">Learn</div>
        <div className="flex items-center gap-4">
          <InstallButton />
          <button onClick={onLogout} className="text-dim text-sm hover:text-muted transition-colors">
            Sign out
          </button>
        </div>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {subjects.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className="bg-surface border border-border rounded-xl p-5 text-left hover:border-border2 transition-colors"
          >
            <div className="flex justify-between items-start mb-3">
              <span className="text-white font-semibold text-lg leading-tight capitalize">
                {s.name.replace(/-/g, ' ')}
              </span>
              {s.streak > 0 && (
                <span className="text-orange-400 font-bold text-sm ml-2 shrink-0">{s.streak}🔥</span>
              )}
            </div>
            <div className="flex items-baseline gap-1 mb-3">
              <span className="text-3xl font-bold text-white">{s.completion ?? 0}%</span>
              <span className="text-dim text-sm">complete</span>
            </div>
            <div className="h-1 bg-border rounded-full overflow-hidden mb-3">
              <div
                className="h-full rounded-full"
                style={{ width: `${s.completion ?? 0}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
              />
            </div>
            <div className="flex gap-3 text-sm">
              <span className="text-muted">{s.completed}/{s.totalTopics} completed</span>
              {s.dueToday > 0 && (
                <span className="text-orange-400 font-semibold">{s.dueToday} due ⚡</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
