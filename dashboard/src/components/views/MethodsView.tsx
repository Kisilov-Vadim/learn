import type { SubjectContext } from '../../types'
import { formatMethod } from '../../lib/utils'

interface Props {
  context: SubjectContext | null
  subjectName: string
}

export function MethodsView({ context, subjectName }: Props) {
  if (!context) return <div className="text-dim text-sm py-10 text-center">Loading…</div>

  const methods = Object.entries(context.methodEffectiveness)
    .sort(([, a], [, b]) => b.avgScoreDelta - a.avgScoreDelta)

  const maxDelta = methods[0]?.[1]?.avgScoreDelta ?? 1

  function barColor(delta: number) {
    if (delta >= 1.5) return 'linear-gradient(90deg,#10b981,#06b6d4)'
    if (delta >= 1.0) return 'linear-gradient(90deg,#6366f1,#8b5cf6)'
    if (delta >= 0.5) return 'linear-gradient(90deg,#eab308,#f97316)'
    return 'linear-gradient(90deg,#ef4444,#f97316)'
  }

  function MethodList({ entries, title }: { entries: typeof methods; title: string }) {
    return (
      <div className="bg-surface rounded-xl px-4 py-4 mb-3.5">
        <div className="text-xs font-semibold tracking-widest text-muted uppercase mb-4">{title}</div>
        {entries.map(([name, m], i) => {
          const pct = maxDelta > 0 ? (m.avgScoreDelta / maxDelta) * 100 : 0
          const delta = m.avgScoreDelta
          const isBest = i === 0
          const isStall = delta < 0.5 && m.touches >= 5
          const deltaColor = delta >= 1 ? '#10b981' : delta >= 0.5 ? '#eab308' : '#ef4444'

          return (
            <div key={name} className="mb-3 last:mb-0">
              <div className="flex justify-between items-center mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-medium text-white">{formatMethod(name)}</span>
                  {isBest && <span className="bg-[#14532d] text-[#4ade80] text-[11px] px-1.5 py-0.5 rounded">best</span>}
                  {isStall && <span className="bg-[#7f1d1d] text-[#fca5a5] text-[11px] px-1.5 py-0.5 rounded">stalls often</span>}
                </div>
                <span className="text-sm font-semibold" style={{ color: deltaColor }}>
                  +{delta.toFixed(1)} avg · {m.touches} touch{m.touches !== 1 ? 'es' : ''}
                </span>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barColor(delta) }} />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div>
      <MethodList entries={methods} title={`${subjectName.replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase())} — method effectiveness`} />
    </div>
  )
}
