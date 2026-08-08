import { useMemo, useState } from 'react'
import { Heatmap } from '../Heatmap'
import { SessionPanel } from '../SessionPanel'
import { formatDate, activeMinutes, formatMinutes } from '../../lib/utils'
import type { Touch, Topic, Session } from '../../types'

function startTimeOf(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface Props {
  sessions: Session[]
  touches: Touch[]
  topics: Topic[]
  streak: number
  onOpenTopic: (id: string) => void
}

export function SessionsView({ sessions, touches, topics, streak, onOpenTopic }: Props) {
  const [selectedSession, setSelectedSession] = useState<string | null>(null)

  const topicNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of topics) map.set(t.id, t.name)
    return map
  }, [topics])

  const topicLevels = useMemo(() => {
    const map = new Map<string, Topic['level']>()
    for (const t of topics) map.set(t.id, t.level)
    return map
  }, [topics])

  const touchesBySession = useMemo(() => {
    const map = new Map<string, Touch[]>()
    for (const t of touches) {
      if (!map.has(t.sessionId)) map.set(t.sessionId, [])
      map.get(t.sessionId)!.push(t)
    }
    return map
  }, [touches])

  // One card per session that has at least one touch, newest first.
  const sessionCards = useMemo(() => {
    return sessions
      .map(s => ({ session: s, items: touchesBySession.get(s.id) ?? [] }))
      .filter(c => c.items.length > 0)
      .sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt))
  }, [sessions, touchesBySession])

  return (
    <div>
      <Heatmap touches={touches} streak={streak} />

      <div className="text-xs font-semibold tracking-widest text-muted uppercase mb-2.5">Recent Sessions</div>
      {sessionCards.map(({ session, items }) => {
        const totalDelta = items.reduce((s, i) => s + (i.scoreAfter - i.scoreBefore), 0)
        const borderColor = totalDelta > 0 ? '#22c55e' : totalDelta < 0 ? '#ef4444' : '#475569'
        const topicNamesPreview = [...new Set(items.map(i => topicNames.get(i.topicId) ?? i.topicId))].join(', ')

        const touchTimes = items.map(i => new Date(i.createdAt).getTime())
        const endAnchor = session.endedAt ? new Date(session.endedAt).getTime() : Math.max(...touchTimes)
        const duration = formatMinutes(activeMinutes([new Date(session.startedAt).getTime(), ...touchTimes, endAnchor]))
        const isSelected = selectedSession === session.id

        return (
          <div
            key={session.id}
            onClick={() => setSelectedSession(session.id)}
            className={`bg-surface rounded-lg px-3.5 py-2.5 mb-1.5 cursor-pointer transition-colors hover:bg-[#252035] ${isSelected ? 'outline outline-1 outline-accent2' : ''}`}
            style={{ borderLeft: `3px solid ${borderColor}`, background: isSelected ? '#2d1f4e' : undefined }}
          >
            <div className="flex justify-between items-center">
              <span className="text-[15px] font-semibold text-white">
                {formatDate(session.startedAt.slice(0, 10))} <span className="text-dim font-normal text-[13px]">· {startTimeOf(session.startedAt)}</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-dim">{duration}</span>
                <span className="text-[14px] font-medium text-accent">{items.length} touch{items.length !== 1 ? 'es' : ''}</span>
              </div>
            </div>
            <div className="text-[13px] text-dim mt-0.5 truncate">{topicNamesPreview}</div>
          </div>
        )
      })}

      <SessionPanel
        sessionId={selectedSession}
        session={sessions.find(s => s.id === selectedSession) ?? null}
        touches={touches}
        topicNames={topicNames}
        topicLevels={topicLevels}
        onClose={() => setSelectedSession(null)}
        onOpenTopic={onOpenTopic}
      />
    </div>
  )
}
