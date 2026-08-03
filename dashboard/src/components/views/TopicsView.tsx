import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { scoreBorderColor, scoreGradient, formatDate, today } from '../../lib/utils'
import type { Topic, Level } from '../../types'

const LEVELS: Level[] = ['beginner', 'junior', 'middle', 'senior', 'principal']

const LEVEL_TAG: Record<Level, string> = {
  beginner:  'bg-[#1e293b] text-[#94a3b8]',
  junior:    'bg-[#1e3a2f] text-[#4ade80]',
  middle:    'bg-[#1c2d4a] text-[#60a5fa]',
  senior:    'bg-[#3b1f4e] text-[#c4b5fd]',
  principal: 'bg-[#431407] text-[#fb923c]',
}

interface Props {
  topics: Topic[]
  onOpenTopic: (id: string) => void
}

export function TopicsView({ topics, onOpenTopic }: Props) {
  const [query, setQuery] = useState('')
  const [levelFilter, setLevelFilter] = useState<Level | 'all'>('all')
  const [openLevel, setOpenLevel] = useState<Level | null>(() => {
    // open the current level by default
    return null
  })

  const todayStr = today()
  const q = query.toLowerCase().trim()

  const dueTopics = topics.filter(t => t.nextReview && t.nextReview <= todayStr && t.status !== 'not-started' && t.status !== 'completed')
  const isSearching = q.length > 0 || levelFilter !== 'all'

  const filtered = isSearching
    ? topics.filter(t => {
        const matchesLevel = levelFilter === 'all' || t.level === levelFilter
        const matchesQuery = !q || t.name.toLowerCase().includes(q)
        return matchesLevel && matchesQuery
      })
    : []

  function toggleLevel(l: Level) {
    setOpenLevel(prev => prev === l ? null : l)
  }

  return (
    <div>
      {/* Due today banner */}
      {dueTopics.length > 0 && !isSearching && (
        <div className="mb-3.5 bg-[#1f1200] border border-[#7c2d12] rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-orange-400 font-semibold text-sm">⚡ {dueTopics.length} topic{dueTopics.length !== 1 ? 's' : ''} due today</span>
          </div>
          <div className="flex flex-col gap-1">
            {dueTopics.map(t => (
              <button
                key={t.id}
                onClick={() => onOpenTopic(t.id)}
                className="text-left text-sm text-[#fdba74] hover:text-orange-300 transition-colors"
              >
                → {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="sticky -top-5 z-20 -mt-5 -mx-12 px-12 pt-5 pb-3 bg-bg/85 backdrop-blur-xl border-b border-border/60">
        <div className="flex items-center gap-2.5 mb-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search topics…"
            className="flex-1 bg-surface border border-border2 rounded-lg text-[15px] px-3.5 py-2.5 outline-none text-white placeholder:text-faint focus:border-accent transition-colors"
          />
          {isSearching && (
            <span className="text-[13px] text-faint whitespace-nowrap">{filtered.length} topic{filtered.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(['all', ...LEVELS] as const).map(f => (
            <button
              key={f}
              onClick={() => setLevelFilter(f)}
              className={`rounded-full text-[13px] px-3 py-1 border transition-all ${
                levelFilter === f
                  ? 'bg-accent2 border-accent2 text-white'
                  : 'bg-surface border-border text-dim hover:border-border2 hover:text-muted'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Flat search results */}
      <div className="pt-3.5">
      {isSearching ? (
        filtered.length === 0
          ? <div className="text-center text-faint text-sm py-10">No topics match your search.</div>
          : filtered.map(t => <TopicRow key={t.id} topic={t} todayStr={todayStr} onClick={() => onOpenTopic(t.id)} />)
      ) : (
        /* Level accordion */
        <div className="bg-surface rounded-xl overflow-hidden">
          {LEVELS.map((level, i) => {
            const levelTopics = topics.filter(t => t.level === level)
            if (levelTopics.length === 0) return null
            const mastered = levelTopics.filter(t => t.status === 'completed').length
            const pct = (mastered / levelTopics.length) * 100
            const isOpen = openLevel === level
            const countColor = pct === 100 ? '#10b981' : pct > 0 ? '#eab308' : '#475569'
            const barGrad = pct === 100 ? 'linear-gradient(90deg,#10b981,#06b6d4)' : 'linear-gradient(90deg,#eab308,#f97316)'

            return (
              <div key={level}>
                {i > 0 && <div className="h-px bg-border mx-0" />}
                <button
                  onClick={() => toggleLevel(level)}
                  className="w-full px-3.5 py-3 hover:bg-white/[0.02] transition-colors text-left"
                >
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[15px] font-medium text-white capitalize">{level}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-semibold" style={{ color: countColor }}>{mastered}/{levelTopics.length}</span>
                      <span className="text-[13px] text-dim ml-1">{isOpen ? '▼' : '▶'}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barGrad }} />
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="px-3.5 pb-2.5 pt-1 flex flex-col gap-1.5">
                        {levelTopics.map(t => (
                          <TopicRowCompact key={t.id} topic={t} todayStr={todayStr} onClick={() => onOpenTopic(t.id)} />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      )}
      </div>
    </div>
  )
}

function TopicRow({ topic, todayStr, onClick }: { topic: Topic; todayStr: string; onClick: () => void }) {
  const isDue = topic.nextReview && topic.nextReview <= todayStr
  const notStarted = topic.status === 'not-started'
  const isCompleted = topic.status === 'completed'
  const color = scoreBorderColor(topic.score)
  const pct = (topic.score / topic.desiredScore) * 100

  return (
    <div
      onClick={onClick}
      className="bg-surface rounded-lg px-3.5 py-2.5 mb-1.5 cursor-pointer hover:bg-[#252035] transition-colors"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex justify-between items-center gap-2">
        <span className="text-[14px] font-medium text-white flex-1">{topic.name}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {isCompleted && <span className="bg-[#052e16] text-emerald-400 text-[11px] font-semibold px-1.5 py-0.5 rounded">done</span>}
          {!isCompleted && isDue && <span className="bg-[#431407] text-orange-400 text-[11px] font-semibold px-1.5 py-0.5 rounded">due</span>}
          {notStarted
            ? <span className="text-[13px] text-faint">not started</span>
            : <span className="text-[13px] font-semibold" style={{ color }}>{topic.score}/{topic.desiredScore}</span>}
          <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${LEVEL_TAG[topic.level]}`}>{topic.level}</span>
        </div>
      </div>
      {!notStarted && (
        <div className="h-[3px] bg-border rounded-full mt-1.5 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: scoreGradient(topic.score) }} />
        </div>
      )}
    </div>
  )
}

function TopicRowCompact({ topic, todayStr, onClick }: { topic: Topic; todayStr: string; onClick: () => void }) {
  const notStarted = topic.status === 'not-started'
  const isCompleted = topic.status === 'completed'
  const color = scoreBorderColor(topic.score)
  const pct = (topic.score / topic.desiredScore) * 100
  const dueStr = isCompleted
    ? 'completed'
    : topic.nextReview
    ? (topic.nextReview <= todayStr ? `${formatDate(topic.nextReview)} ⚡` : formatDate(topic.nextReview))
    : 'not started'

  return (
    <div
      onClick={onClick}
      className={`bg-bg rounded-md px-2.5 py-2 cursor-pointer hover:bg-[#1f1b2e] hover:brightness-110 transition-all ${notStarted ? 'opacity-45' : ''}`}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex justify-between items-center">
        <span className="text-[14px] font-medium text-white">{topic.name}</span>
        <span className="text-[13px]" style={{ color: isCompleted ? '#10b981' : color }}>
          {notStarted ? 'not started' : `${topic.score}/${topic.desiredScore} · ${dueStr}`}
        </span>
      </div>
      {!notStarted && (
        <div className="h-[3px] bg-border rounded-full mt-1 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: scoreGradient(topic.score) }} />
        </div>
      )}
    </div>
  )
}
