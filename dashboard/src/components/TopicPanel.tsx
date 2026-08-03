import { AnimatePresence, motion } from 'framer-motion'
import { useTopic } from '../hooks/useSubject'
import { scoreBorderColor, scoreGradient, formatDate, formatDateTime, formatMethod, capitalize, today } from '../lib/utils'

interface Props {
  topicId: string | null
  onClose: () => void
}

export function TopicPanel({ topicId, onClose }: Props) {
  const { topic, loading } = useTopic(topicId)
  const todayStr = today()

  return (
    <AnimatePresence>
      {topicId && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/30"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed top-0 right-0 bottom-0 z-50 w-[52%] max-w-[700px] flex flex-col overflow-y-auto"
            style={{ background: '#1a1730', borderLeft: '1px solid #3d2d5e' }}
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            {loading || !topic ? (
              <div className="flex-1 flex items-center justify-center text-dim">Loading…</div>
            ) : (
              <>
                <div className="px-[18px] py-4 border-b border-border flex justify-between items-start shrink-0">
                  <div>
                    <div className="text-[11px] font-semibold tracking-widest text-muted uppercase mb-1">{capitalize(topic.level)} Topic</div>
                    <div className="text-xl font-bold text-white">{topic.name}</div>
                  </div>
                  <button onClick={onClose} className="text-faint hover:text-white text-2xl px-1 shrink-0 transition-colors">✕</button>
                </div>

                <div className="px-[18px] py-4 flex-1">
                  {/* Stats row */}
                  <div className="flex gap-2 mb-4">
                    {[
                      {
                        value: <>{topic.score}<span className="text-faint text-sm">/{topic.desiredScore}</span></>,
                        valueStyle: { color: scoreBorderColor(topic.score) },
                        label: 'current score',
                        sub: (
                          <div className="h-1.5 bg-border rounded-full overflow-hidden mt-2">
                            <div className="h-full rounded-full" style={{ width: `${(topic.score / topic.desiredScore) * 100}%`, background: scoreGradient(topic.score) }} />
                          </div>
                        ),
                      },
                      {
                        value: topic.nextReview
                          ? <>{formatDate(topic.nextReview)}{topic.nextReview <= todayStr ? ' ⚡' : ''}</>
                          : '—',
                        valueStyle: { fontSize: 14, color: topic.nextReview && topic.nextReview <= todayStr ? '#f97316' : undefined },
                        label: 'next review',
                        sub: <span className="text-sm text-muted mt-1">{topic.reviewCount} touch{topic.reviewCount !== 1 ? 'es' : ''}</span>,
                      },
                      {
                        value: topic.bestMethod ? formatMethod(topic.bestMethod) : '—',
                        valueStyle: { fontSize: 13, color: '#c4b5fd', lineHeight: '1.3' },
                        label: 'best method',
                        sub: null,
                      },
                    ].map((stat, i) => (
                      <div key={i} className="flex-1 bg-bg rounded-lg p-3">
                        <div className="text-2xl font-bold text-white" style={stat.valueStyle as React.CSSProperties}>{stat.value}</div>
                        <div className="text-sm text-dim mt-0.5">{stat.label}</div>
                        {stat.sub}
                      </div>
                    ))}
                  </div>

                  {/* History */}
                  <div className="text-xs font-semibold tracking-widest text-muted uppercase mb-3">Learning History</div>
                  <div className="mb-4">
                    {topic.history && topic.history.length > 0 ? (
                      [...topic.history].reverse().map((entry, i) => {
                        const delta = entry.scoreAfter - entry.scoreBefore
                        const deltaStr = delta > 0
                          ? `${entry.scoreBefore} → ${entry.scoreAfter} ${'↑'.repeat(Math.min(delta, 3))}`
                          : delta < 0
                          ? `${entry.scoreBefore} → ${entry.scoreAfter} ↓`
                          : `${entry.scoreBefore} → ${entry.scoreAfter} ⚠`
                        const color = scoreBorderColor(entry.scoreAfter)
                        return (
                          <div key={i} className="bg-bg rounded-lg overflow-hidden mb-1.5" style={{ borderLeft: `2px solid ${color}` }}>
                            <div className="px-3 py-2 flex justify-between items-center">
                              <div>
                                <span className="text-sm text-dim">{formatDateTime(entry.createdAt)} · </span>
                                <span className="bg-border text-[#c4b5fd] text-[13px] px-1.5 py-0.5 rounded">{formatMethod(entry.method)}</span>
                              </div>
                              <span className="text-sm font-bold" style={{ color }}>{deltaStr}</span>
                            </div>
                            {entry.agentComment && (
                              <div className="px-3 pb-2 text-[13px] text-dim leading-relaxed italic">"{entry.agentComment}"</div>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <p className="text-dim text-xs">No touches yet.</p>
                    )}
                  </div>

                  {/* Resources */}
                  {topic.resources && topic.resources.length > 0 && (
                    <>
                      <div className="text-xs font-semibold tracking-widest text-muted uppercase mb-3">Resources</div>
                      {topic.resources.map((r, i) => {
                        const icon = ({ video: '▶', article: '📄', opensource: '⭐', course: '🎓', feed: '📡' } as Record<string, string>)[r.type] ?? '📄'
                        const content = `${icon} ${r.title}${r.section ? ` — ${r.section}` : ''}`
                        return r.url
                          ? <a key={i} href={r.url} target="_blank" rel="noopener" className="block bg-bg rounded-md px-3 py-2 text-[13px] text-dim mb-1 hover:text-accent hover:bg-[#1e1630] transition-colors">{content}</a>
                          : <div key={i} className="block bg-bg rounded-md px-3 py-2 text-[13px] text-dim mb-1">{content}</div>
                      })}
                    </>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
