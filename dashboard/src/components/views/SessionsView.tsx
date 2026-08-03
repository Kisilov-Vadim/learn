import { useMemo, useState } from 'react'
import { Heatmap } from '../Heatmap'
import { SessionPanel } from '../SessionPanel'
import { formatDate } from '../../lib/utils'

function startTime(items: Touch[]): string {
  const earliest = items.reduce((a, b) => a.createdAt < b.createdAt ? a : b)
  const d = new Date(earliest.createdAt)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function formatDuration(items: Touch[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return '< 1m'
  const times = items.map(t => new Date(t.createdAt).getTime())
  const mins = Math.round((Math.max(...times) - Math.min(...times)) / 60000)
  if (mins < 1) return '< 1m'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
import type { Touch, Topic } from '../../types'

interface Props {
  touches: Touch[]
  topics: Topic[]
  streak: number
  onOpenTopic: (id: string) => void
}

export function SessionsView({ touches, topics, streak, onOpenTopic }: Props) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const topicNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of topics) map.set(t.id, t.name)
    return map
  }, [topics])

  const sessionGroups = useMemo(() => {
    const map = new Map<string, Touch[]>()
    for (const t of touches) {
      const date = t.createdAt.slice(0, 10)
      if (!map.has(date)) map.set(date, [])
      map.get(date)!.push(t)
    }
    return Array.from(map.entries())
      .map(([date, items]) => ({ date, items }))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [touches])

  return (
    <div>
      <Heatmap touches={touches} streak={streak} />

      <div className="text-xs font-semibold tracking-widest text-muted uppercase mb-2.5">Recent Sessions</div>
      {sessionGroups.map(({ date, items }) => {
        const totalDelta = items.reduce((s, i) => s + (i.scoreAfter - i.scoreBefore), 0)
        const borderColor = totalDelta > 0 ? '#22c55e' : totalDelta < 0 ? '#ef4444' : '#475569'
        const topicNamesPreview = [...new Set(items.map(i => topicNames.get(i.topicId) ?? i.topicId))].join(', ')
        const duration = formatDuration(items)

        return (
          <div
            key={date}
            onClick={() => setSelectedDate(date)}
            className={`bg-surface rounded-lg px-3.5 py-2.5 mb-1.5 cursor-pointer transition-colors hover:bg-[#252035] ${selectedDate === date ? 'outline outline-1 outline-accent2' : ''}`}
            style={{ borderLeft: `3px solid ${borderColor}`, background: selectedDate === date ? '#2d1f4e' : undefined }}
          >
            <div className="flex justify-between items-center">
              <span className="text-[15px] font-semibold text-white">{formatDate(date)} <span className="text-dim font-normal text-[13px]">· {startTime(items)}</span></span>
              <div className="flex items-center gap-2">
                {duration && <span className="text-[13px] text-dim">{duration}</span>}
                <span className="text-[14px] font-medium text-accent">{items.length} touch{items.length !== 1 ? 'es' : ''}</span>
              </div>
            </div>
            <div className="text-[13px] text-dim mt-0.5 truncate">{topicNamesPreview}</div>
          </div>
        )
      })}

      <SessionPanel
        date={selectedDate}
        touches={touches}
        topicNames={topicNames}
        onClose={() => setSelectedDate(null)}
        onOpenTopic={onOpenTopic}
      />
    </div>
  )
}
