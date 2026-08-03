import { useMemo, useState } from 'react'
import { heatmapColor } from '../lib/utils'
import type { Touch } from '../types'

interface Props {
  touches: Touch[]
  streak: number
}

const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

export function Heatmap({ touches, streak }: Props) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

  const activityMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of touches) {
      const date = t.createdAt.slice(0, 10)
      map.set(date, (map.get(date) || 0) + 1)
    }
    return map
  }, [touches])

  const { weeks, labelSpans, todayStr } = useMemo(() => {
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    let sm = now.getMonth() - 11
    let sy = now.getFullYear()
    if (sm < 0) { sm += 12; sy -= 1 }

    const rangeStart = new Date(sy, sm, 1)
    const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const startOffset = (rangeStart.getDay() + 6) % 7
    const totalDays = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1
    const endPad = 6 - ((rangeEnd.getDay() + 6) % 7)
    const WEEKS = Math.ceil((startOffset + totalDays + endPad) / 7)

    const weeks: { dateStr: string | null; count: number }[][] = []
    const labelSpans: { text: string; span: number }[] = []
    let curMonth = -1, curSpan = 0

    for (let w = 0; w < WEEKS; w++) {
      let colMonth = curMonth
      for (let r = 0; r < 7; r++) {
        const off = w * 7 + r - startOffset
        if (off >= 0 && off < totalDays) {
          const d = new Date(rangeStart)
          d.setDate(d.getDate() + off)
          colMonth = d.getMonth()
          break
        }
      }
      if (colMonth !== curMonth) {
        if (curSpan > 0) labelSpans.push({ text: MONTH_FULL[curMonth], span: curSpan })
        curMonth = colMonth
        curSpan = 1
      } else curSpan++

      const col = Array.from({ length: 7 }, (_, r) => {
        const off = w * 7 + r - startOffset
        if (off < 0 || off >= totalDays) return { dateStr: null, count: 0 }
        const d = new Date(rangeStart)
        d.setDate(d.getDate() + off)
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        return { dateStr, count: activityMap.get(dateStr) || 0 }
      })
      weeks.push(col)
    }
    if (curSpan > 0) labelSpans.push({ text: MONTH_FULL[curMonth], span: curSpan })

    return { weeks, labelSpans, todayStr }
  }, [activityMap])

  return (
    <div className="rounded-xl p-4 mb-3.5" style={{ background: '#161b22' }}>
      <div className="flex justify-between items-center mb-3.5">
        <span className="text-xs font-semibold tracking-widest text-muted uppercase">Topic Touches — Last 12 Months</span>
        {streak > 0 && <span className="text-orange-400 font-bold text-sm">{streak}🔥 streak</span>}
      </div>

      {/* Month labels */}
      <div className="flex mb-1.5">
        <div className="w-9 shrink-0" />
        <div className="flex flex-1 min-w-0">
          {labelSpans.map((l, i) => (
            <div key={i} className="text-xs text-dim font-medium overflow-hidden text-ellipsis whitespace-nowrap" style={{ flex: l.span }}>
              {l.text}
            </div>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex">
        <div className="w-9 shrink-0 flex flex-col gap-[3px] pt-px">
          {DAY_LABELS.map(l => (
            <div key={l} className="h-5 text-[11px] text-dim leading-5">{l}</div>
          ))}
        </div>
        <div className="flex flex-1 gap-[3px] min-w-0">
          {weeks.map((col, wi) => (
            <div key={wi} className="flex flex-col gap-[3px] flex-1 min-w-0">
              {col.map((cell, ri) => {
                if (!cell.dateStr) return <div key={ri} className="h-5" style={{ background: 'transparent' }} />
                const label = new Date(cell.dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
                  (cell.count ? ` — ${cell.count} touch${cell.count > 1 ? 'es' : ''}` : '')
                return (
                  <div
                    key={ri}
                    className="h-5 rounded-[3px] cursor-default"
                    style={{
                      background: heatmapColor(cell.count),
                      outline: cell.dateStr === todayStr ? '1px solid #e879f9' : undefined,
                    }}
                    onMouseEnter={e => {
                      const r = (e.target as HTMLElement).getBoundingClientRect()
                      setTooltip({ text: label, x: r.left + r.width / 2, y: r.top })
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-1.5 mt-2.5 text-[13px] text-faint">
        <span>Less</span>
        {['#21262d','#4a044e','#86198f','#c026d3','#d946ef','#e879f9'].map(c => (
          <div key={c} className="w-4 h-4 rounded-[2px]" style={{ background: c }} />
        ))}
        <span>More</span>
      </div>

      {tooltip && (
        <div
          className="fixed z-50 bg-[#1e1e2e] text-white text-xs px-2 py-1 rounded-md pointer-events-none whitespace-nowrap -translate-x-1/2"
          style={{ left: tooltip.x, top: tooltip.y - 36 }}
        >
          {tooltip.text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1e1e2e]" />
        </div>
      )}
    </div>
  )
}
