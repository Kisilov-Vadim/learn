import type { Subject } from '../types'
import { InstallButton } from './InstallButton'

interface Props {
  subjects: Subject[]
  activeId: string
  onSubjectChange: (id: string) => void
  onHome: () => void
  onLogout: () => void
  streak: number
}

export function Header({ subjects, activeId, onSubjectChange, onHome, onLogout, streak }: Props) {
  return (
    <header className="flex justify-between items-center py-4 border-b border-border px-12">
      <div className="flex items-center gap-3">
        <button onClick={onHome} className="text-accent text-xl font-bold tracking-tight hover:opacity-80 transition-opacity">
          Learn
        </button>
        <select
          value={activeId}
          onChange={e => onSubjectChange(e.target.value)}
          className="bg-surface border border-border2 text-white text-base px-2.5 py-1 rounded-md outline-none"
        >
          {subjects.map(s => (
            <option key={s.id} value={s.id}>
              {s.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-4">
        {streak > 0 && <span className="text-orange-400 font-bold text-lg">{streak}🔥</span>}
        <InstallButton />
        <button onClick={onLogout} className="text-dim text-sm hover:text-muted transition-colors">
          Sign out
        </button>
      </div>
    </header>
  )
}
