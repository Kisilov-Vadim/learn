# Session Active Duration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Verify each task with `cd dashboard && npm run build` — there is no unit-test runner. Checkbox (`- [ ]`) steps.

**Goal:** Replace the day-bucketed, touch-derived session duration with per-session, capped-gap active time, using the real `sessions.startedAt`/`endedAt`.

**Architecture:** New `useSessions` hook feeds `SessionsView`, which groups touches by `sessionId` and computes duration via `activeMinutes([startedAt, ...touchTimes, endAnchor], cap=30)`. `SessionPanel` is keyed by session. See spec `docs/superpowers/specs/2026-08-08-session-active-duration-design.md`.

**Tech:** Vite/React/TS/Tailwind. Build gate only.

---

## Task 1: helpers `activeMinutes` + `formatMinutes`

**Files:** Modify `dashboard/src/lib/utils.ts`

- [ ] Add to `utils.ts`:
```typescript
// Sum of gaps between sorted event timestamps (epoch ms), each gap capped at capMin.
// Idle time beyond the cap is discarded, so abandoned sessions can't inflate the total.
export function activeMinutes(events: number[], capMin = 30): number {
  const sorted = [...events].sort((a, b) => a - b)
  const cap = capMin * 60000
  let ms = 0
  for (let i = 1; i < sorted.length; i++) ms += Math.min(sorted[i] - sorted[i - 1], cap)
  return Math.round(ms / 60000)
}

export function formatMinutes(mins: number): string {
  if (mins < 1) return '< 1m'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
```
- [ ] `cd dashboard && npm run build` → PASS. Commit `feat(dashboard): activeMinutes + formatMinutes helpers`.

## Task 2: `useSessions` hook

**Files:** Modify `dashboard/src/hooks/useSubject.ts`

- [ ] Add `Session` to the type import: `import type { Topic, Touch, SubjectContext, Session } from '../types'`.
- [ ] Append:
```typescript
export function useSessions(subjectId: string | null) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!subjectId) { setSessions([]); return }
    setLoading(true); setError(null)
    rpc<{ sessions: Session[] }>('query_sessions', { p_subject_id: subjectId, p_limit: 1000 })
      .then(data => setSessions(data?.sessions ?? []))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [subjectId])

  useEffect(() => { load() }, [load])
  return { sessions, loading, error, reload: load }
}
```
- [ ] Build → PASS. Commit `feat(dashboard): useSessions hook (query_sessions)`.

## Task 3: `SessionsView` — group by session + capped duration

**Files:** Modify `dashboard/src/components/views/SessionsView.tsx` (full rewrite in spec's shape)

- [ ] Props gain `sessions: Session[]`. Remove `formatDuration`/`startTime`; import `formatDate, activeMinutes, formatMinutes`. Build `touchesBySession: Map<sessionId, Touch[]>`. Cards = sessions with ≥1 touch, sorted `startedAt` desc. Per card: `endAnchor = session.endedAt ? Date(endedAt) : max(touchTimes)`; `mins = activeMinutes([Date(startedAt), ...touchTimes, endAnchor])`. Selection state is `sessionId` (was `date`). Keep `topicLevels` map (for SessionPanel). Heatmap unchanged.
- [ ] `SessionPanel` call becomes: `sessionId={selectedSession}`, `session={sessions.find(s => s.id === selectedSession) ?? null}`, plus existing `touches/topicNames/topicLevels/onClose/onOpenTopic`.
- [ ] Build will be RED until Task 4 (SessionPanel props change) + Task 5 (SubjectShell passes `sessions`). Continue.

## Task 4: `SessionPanel` — key by session, show start + duration

**Files:** Modify `dashboard/src/components/SessionPanel.tsx`

- [ ] Import adds `activeMinutes, formatMinutes` from `../lib/utils` and `Session` from `../types`.
- [ ] Props: replace `date: string | null` with `sessionId: string | null` and `session: Session | null`.
- [ ] `sessionTouches` filters `t.sessionId === sessionId`. Gate render on `sessionId && session`.
- [ ] Header: title `{formatDate(session.startedAt.slice(0,10))}, {session.startedAt.slice(0,4)}`; sub-line appends ` · {formatMinutes(activeMinutes([startedAt, ...touchTimes, endAnchor]))}` when touches exist.
- [ ] Keep touch cards (incl. level badge from prior work) unchanged.

## Task 5: `SubjectShell` — fetch + pass sessions, wire error

**Files:** Modify `dashboard/src/components/SubjectShell.tsx`

- [ ] Import `useSessions`; add `const { sessions, error: sessionsError, reload: reloadSessions } = useSessions(dataSubjectId)`.
- [ ] Sessions tab:
```tsx
            {activeTab === 'sessions' && (
              (touchesError || sessionsError)
                ? <ErrorState message={touchesError || sessionsError || undefined} onRetry={() => { reloadTouches(); reloadSessions() }} />
                : touches.length === 0
                  ? <EmptyState icon="🕒" title="No sessions yet" message="Your review history will show up here." />
                  : <SessionsView sessions={sessions} touches={touches} topics={topics} streak={context?.streak ?? 0} onOpenTopic={openTopic} />
            )}
```
- [ ] Build → PASS (green here). Commit Tasks 3–5 together: `feat(dashboard): per-session capped-gap duration`.

## Task 6: verify

- [ ] `cd dashboard && npm run build` clean. Manual (post-deploy): single-topic ~20m sitting shows ~20m; two same-day sittings = two cards; 26h abandoned session ≈ 30m; card click opens that session.
