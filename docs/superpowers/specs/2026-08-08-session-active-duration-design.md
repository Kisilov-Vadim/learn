# Accurate Session Duration (capped-gap, per session) — Design

Date: 2026-08-08
Status: Approved (design), pending implementation

## Problem

The dashboard's "Recent Sessions" list groups touches by **calendar day** and derives duration
from `max(touch.createdAt) − min(touch.createdAt)`. A touch is only written when a topic
*completes*, so its `createdAt` is the finish time. Result: a 26-minute single-topic sitting
shows "< 1m" (one touch, no span), and the real start (before the first touch) is invisible.

The real start already exists: `sessions.startedAt` (set by `create_session` at session start).
But `sessions.startedAt → endedAt` taken raw overstates duration for sessions that were created
then left idle (observed: a session spanning 26h with a single touch the next day; and
`endedAt` sometimes `null`).

## Solution

Group by **session** (not day) and compute a **capped-gap "active time"**: sum the gaps between
consecutive known events, capping each gap so idle time can't inflate the total.

`activeMinutes(events: number[], capMin = 30)`:
- `events` = sorted epoch-ms of `[startedAt, ...each touch.createdAt, endAnchor]`, where
  `endAnchor = endedAt ?? lastTouchTime ?? startedAt`.
- duration = `Σ min(gap_i, capMin*60000)` over consecutive pairs, returned in **minutes**.

Rationale: a real 26-min first-topic gap counts fully; a 26h idle gap counts as the cap
(30 min). Robust to `null` `endedAt` and abandoned sessions.

## Data

New hook `useSessions(subjectId)` → `query_sessions` → `{ sessions: Session[] }`
(`Session = { id, subjectId, startedAt, endedAt: string | null }`, confirmed camelCase, newest
first). Exposes `{ sessions, loading, error, reload }` (same shape as the other hooks).

`Session` type already exists in `types/index.ts` (`endedAt: string | null`).

## UI changes

**SessionsView** (`components/views/SessionsView.tsx`):
- Fetch is lifted to `SubjectShell` (like topics/touches/context) and passed in as `sessions`;
  the view builds a `touchesBySession: Map<sessionId, Touch[]>`.
- "Recent Sessions" cards = one per `Session` **that has ≥1 touch**, sorted by `startedAt` desc.
- Each card shows: date + start time (from `startedAt`), touch count, topic-name preview,
  and the capped duration via `activeMinutes`.
- Clicking a card selects its `sessionId` (was `date`).
- Heatmap stays unchanged (per-day touch counts).

**SessionPanel** (`components/SessionPanel.tsx`):
- Keyed by `sessionId` instead of `date`. Filters touches by `session_id`.
- Header shows the session date + start time + capped duration.
- Retains the existing topic-name + level badges + per-touch cards.

**SubjectShell** (`components/SubjectShell.tsx`):
- Add `useSessions(dataSubjectId)`; pass `sessions` (+ its error/reload) into `SessionsView`.
- Sessions tab empty/error: show `ErrorState` on `touchesError || sessionsError`; `EmptyState`
  (sessions) when there are no touches (unchanged trigger — no touches means nothing to show).

## Helper formatting

Reuse a single formatter: `formatMinutes(mins)` → `'< 1m'` for 0, `'{n}m'` under 60, else
`'{h}h {m}m'` / `'{h}h'`. Replaces the old `formatDuration`.

## Edge cases

- Session with 0 touches → hidden from the list.
- `endedAt = null` → end anchor is the last touch time (or `startedAt` if somehow no touches,
  but those are hidden anyway).
- Session crossing midnight → one card (correct).
- Touch whose `sessionId` has no matching `sessions` row (shouldn't happen — `add_touch`
  requires a session) → that touch is ignored by the session list (still counts in the heatmap).

## Files

- `dashboard/src/hooks/useSubject.ts` — add `useSessions`.
- `dashboard/src/lib/utils.ts` — add `activeMinutes` + `formatMinutes`.
- `dashboard/src/components/views/SessionsView.tsx` — session grouping + capped duration.
- `dashboard/src/components/SessionPanel.tsx` — key by session, show start + duration.
- `dashboard/src/components/SubjectShell.tsx` — fetch + pass sessions.

## Testing

`cd dashboard && npm run build` (tsc + vite). Manual: a single-topic 20-min sitting shows ~20m
(not "< 1m"); two sittings the same day render as two cards; the 26h abandoned session shows
≈30m; clicking a card opens that session's touches.
