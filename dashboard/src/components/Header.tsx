import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Subject } from '../types'
import { InstallButton } from './InstallButton'

interface Props {
  subjects: Subject[]
  activeId?: string | null
  onSubjectChange?: (id: string) => void
  onHome: () => void
  onRules: () => void
  onLogout: () => void
  streak?: number
}

export function Header({ subjects, activeId, onSubjectChange, onHome, onRules, onLogout, streak = 0 }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <header className="flex justify-between items-center py-4 border-b border-border px-6 md:px-12">
      <div className="flex items-center gap-3">
        <button onClick={onHome} className="text-accent text-xl font-bold tracking-tight hover:opacity-80 transition-opacity">
          Learn
        </button>
        {activeId && onSubjectChange && (
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
        )}
      </div>

      {/* Desktop nav */}
      <div className="hidden md:flex items-center gap-4">
        {streak > 0 && <span className="text-orange-400 font-bold text-lg">{streak}🔥</span>}
        <button
          onClick={onRules}
          className="text-sm font-medium px-3 py-1.5 rounded-md border border-border2 text-muted hover:text-white hover:border-accent transition-colors"
        >
          Rules
        </button>
        <InstallButton />
        <button onClick={onLogout} className="text-dim text-sm hover:text-muted transition-colors">
          Sign out
        </button>
      </div>

      {/* Mobile burger */}
      <button
        onClick={() => setMenuOpen(true)}
        className="md:hidden text-white text-2xl leading-none p-1"
        aria-label="Open menu"
      >
        ☰
      </button>

      {/* Mobile side panel */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              className="fixed top-0 right-0 z-50 h-full w-72 max-w-[80%] bg-surface border-l border-border p-6 flex flex-col gap-4 md:hidden"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-white font-semibold text-lg">Menu</span>
                <button onClick={() => setMenuOpen(false)} className="text-dim hover:text-white text-lg" aria-label="Close menu">✕</button>
              </div>
              {streak > 0 && <span className="text-orange-400 font-bold text-lg">{streak}🔥</span>}
              <button
                onClick={() => { setMenuOpen(false); onRules() }}
                className="text-left text-white text-base py-2 hover:text-accent transition-colors"
              >
                Rules
              </button>
              <InstallButton triggerClassName="text-left text-white text-base py-2 hover:text-accent transition-colors" />
              <button
                onClick={() => { setMenuOpen(false); onLogout() }}
                className="text-left text-dim text-base py-2 hover:text-white transition-colors"
              >
                Sign out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  )
}
