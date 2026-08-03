import { AnimatePresence, motion } from 'framer-motion'
import { formatDate, formatDateTime, formatMethod } from '../lib/utils'
import type { Touch } from '../types'

interface Props {
  date: string | null
  touches: Touch[]
  topicNames: Map<string, string>
  onClose: () => void
  onOpenTopic: (id: string) => void
}

export function SessionPanel({ date, touches, topicNames, onClose, onOpenTopic }: Props) {
  const sessionTouches = date
    ? touches.filter(t => t.createdAt.slice(0, 10) === date).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : []

  const touchCount = sessionTouches.length
  const topicCount = new Set(sessionTouches.map(t => t.topicId)).size

  return (
    <AnimatePresence>
      {date && (
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
            <div className="px-[18px] py-4 border-b border-border flex justify-between items-start shrink-0">
              <div>
                <div className="text-[11px] font-semibold tracking-widest text-muted uppercase mb-1">Session</div>
                <div className="text-xl font-bold text-white">{formatDate(date)}, {date.slice(0, 4)}</div>
                <div className="text-sm text-dim mt-1">
                  {touchCount} touch{touchCount !== 1 ? 'es' : ''} · {topicCount} topic{topicCount !== 1 ? 's' : ''}
                </div>
              </div>
              <button onClick={onClose} className="text-faint hover:text-white text-2xl px-1 shrink-0 transition-colors">✕</button>
            </div>

            <div className="px-[18px] py-4 flex-1">
              {sessionTouches.map((touch, i) => {
                const delta = touch.scoreAfter - touch.scoreBefore
                const deltaStr = delta > 0
                  ? `${touch.scoreBefore} → ${touch.scoreAfter} ${'↑'.repeat(delta)}`
                  : delta < 0
                  ? `${touch.scoreBefore} → ${touch.scoreAfter} ↓`
                  : `${touch.scoreBefore} → ${touch.scoreAfter} ⚠`
                const borderColor = delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : '#475569'
                const effectivenessColor = touch.effectiveness === 'high' ? '#10b981' : touch.effectiveness === 'medium' ? '#eab308' : '#ef4444'
                const topicName = topicNames.get(touch.topicId) ?? touch.topicId

                return (
                  <div key={i} className="bg-bg rounded-xl overflow-hidden mb-2.5" style={{ borderLeft: `3px solid ${borderColor}` }}>
                    <div className="px-3.5 py-3">
                      <div className="flex justify-between items-center">
                        <span className="text-base font-semibold text-white">{topicName}</span>
                        <span className="text-sm font-bold" style={{ color: borderColor }}>{deltaStr}</span>
                      </div>
                      <div className="flex gap-2 items-center mt-1">
                        <span className="bg-border text-[#c4b5fd] text-[13px] px-1.5 py-0.5 rounded">{formatMethod(touch.method)}</span>
                        <span className="text-[10px]" style={{ color: effectivenessColor }}>{touch.effectiveness} effectiveness</span>
                        <span className="text-[10px] text-faint">{formatDateTime(touch.createdAt)}</span>
                      </div>
                    </div>
                    {touch.agentComment && (
                      <div className="px-3.5 pb-2.5 border-t border-border text-[14px] text-dim leading-relaxed italic">
                        "{touch.agentComment}"
                      </div>
                    )}
                    <button
                      onClick={() => { onClose(); onOpenTopic(touch.topicId) }}
                      className="w-full text-left px-3.5 py-2 border-t border-border text-sm text-[#c4b5fd] hover:text-accent transition-colors"
                    >
                      View topic history →
                    </button>
                  </div>
                )
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
