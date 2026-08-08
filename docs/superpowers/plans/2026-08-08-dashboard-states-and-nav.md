# Dashboard Empty/Error States + Rules Page + Responsive Header — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared empty/error states across the dashboard, move global rules to their own `/rules` page, and make the header nav responsive with a mobile burger + animated side panel.

**Architecture:** Data hooks gain a uniform `{ data, loading, error, reload }` shape so any view can render an `ErrorState` with a working Refresh. Two shared presentational components (`EmptyState`, `ErrorState`) render zero-data and failure UI with per-entity copy. One responsive `Header` (desktop nav + framer-motion mobile panel) is used by every page, including a new `RulesPage`.

**Tech Stack:** Vite + React + React Router + Tailwind; `framer-motion` (already a dependency).

**No test runner:** `dashboard/` has no vitest/jest. Every task verifies with `cd dashboard && npm run build` (runs `tsc -b` then `vite build`) — it must pass with no type errors. Manual click-through happens post-deploy (see spec Testing).

---

## File Structure

Create:
- `dashboard/src/components/StateViews.tsx` — `EmptyState` + `ErrorState` (one shared shell).
- `dashboard/src/components/RulesPage.tsx` — the `/rules` page.

Modify:
- `dashboard/src/hooks/useSubject.ts` — add `error` + `reload` to `useTopics`, `useTouches`, `useSubjectContext`, `useTopic`.
- `dashboard/src/hooks/useRules.ts` — add `error` + `reload`.
- `dashboard/src/components/Header.tsx` — unified responsive header + mobile side panel.
- `dashboard/src/App.tsx` — `/rules` route; pass `error`/`reload` into `SubjectCards`.
- `dashboard/src/components/SubjectCards.tsx` — shared header, remove RulesPanel, empty/error.
- `dashboard/src/components/SubjectShell.tsx` — shared header (add `onRules`), per-tab empty/error, full-width Rules tab.
- `dashboard/src/components/RulesPanel.tsx` — empty/error states via the shared components.

**Header API (used by every task that renders it):**
```ts
interface HeaderProps {
  subjects: Subject[]
  activeId?: string | null            // subject <select> shown only when set
  onSubjectChange?: (id: string) => void
  onHome: () => void
  onRules: () => void
  onLogout: () => void
  streak?: number
}
```

---

## Task 1: Data hooks — uniform `error` + `reload`

**Files:**
- Modify: `dashboard/src/hooks/useSubject.ts` (full rewrite below)
- Modify: `dashboard/src/hooks/useRules.ts`

- [ ] **Step 1: Rewrite `useSubject.ts`**

Replace the entire file with:
```typescript
import { useCallback, useEffect, useState } from 'react'
import { rpc } from '../lib/supabase'
import type { Topic, Touch, SubjectContext } from '../types'

export function useTopics(subjectId: string | null) {
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!subjectId) { setTopics([]); return }
    setLoading(true); setError(null)
    rpc<{ topics: Topic[] }>('query_topics', { p_subject_id: subjectId, p_limit: 500 })
      .then(data => setTopics(data?.topics ?? []))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [subjectId])

  useEffect(() => { load() }, [load])
  return { topics, loading, error, reload: load }
}

export function useTouches(subjectId: string | null) {
  const [touches, setTouches] = useState<Touch[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!subjectId) { setTouches([]); return }
    setLoading(true); setError(null)
    rpc<{ touches: Touch[] }>('query_touches', {
      p_subject_id: subjectId,
      p_sort_field: 'createdAt',
      p_sort_dir: 'desc',
      p_limit: 1000,
    })
      .then(data => setTouches(data?.touches ?? []))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [subjectId])

  useEffect(() => { load() }, [load])
  return { touches, loading, error, reload: load }
}

export function useSubjectContext(subjectId: string | null) {
  const [context, setContext] = useState<SubjectContext | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!subjectId) { setContext(null); return }
    setLoading(true); setError(null)
    rpc<SubjectContext>('get_subject_context', { p_subject_id: subjectId })
      .then(data => setContext(data))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [subjectId])

  useEffect(() => { load() }, [load])
  return { context, loading, error, reload: load }
}

export function useTopic(topicId: string | null) {
  const [topic, setTopic] = useState<(Topic & { history: Touch[] }) | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!topicId) { setTopic(null); return }
    setLoading(true); setError(null)
    rpc<Topic>('get_topic', { p_topic_id: topicId })
      .then(async topicData => {
        if (!topicData) { setTopic(null); return }
        // get_topic doesn't include history — fetch touches for this topic separately
        const touchData = await rpc<{ touches: Touch[] }>('query_touches', {
          p_subject_id: topicData.subjectId,
          p_filters: { topicId },
          p_sort_field: 'createdAt',
          p_sort_dir: 'desc',
          p_limit: 100,
        })
        setTopic({ ...topicData, history: touchData?.touches ?? [] })
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [topicId])

  useEffect(() => { load() }, [load])
  return { topic, loading, error, reload: load }
}
```

- [ ] **Step 2: Add `error` + `reload` to `useRules.ts`**

In `dashboard/src/hooks/useRules.ts`, add an `error` state and set it in `load`, and return
both `error` and `reload`. Replace the `load` callback and the `return`:
```typescript
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true); setError(null)
    const params = subjectId
      ? { p_action: 'list', p_subject_id: subjectId }
      : { p_action: 'list', p_scope: 'global' }
    rpc<{ global?: Rule[]; rules?: Rule[] }>('manage_rules', params)
      .then(data => setRules(subjectId ? (data?.rules ?? []) : (data?.global ?? [])))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [subjectId])
```
And change the final return to:
```typescript
  return { rules, loading, error, add, update, remove, reload: load }
```

- [ ] **Step 3: Build**

Run: `cd dashboard && npm run build`
Expected: PASS (existing consumers destructure subsets, so adding fields is non-breaking).

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/hooks/useSubject.ts dashboard/src/hooks/useRules.ts
git commit -m "feat(dashboard): expose error + reload from all data hooks"
```

---

## Task 2: Shared `EmptyState` + `ErrorState`

**Files:**
- Create: `dashboard/src/components/StateViews.tsx`

- [ ] **Step 1: Create the file**

```tsx
import type { ReactNode } from 'react'

// Shared centered card used by both empty and error states.
function Shell({ icon, title, message, children }: { icon: string; title: string; message: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center rounded-xl border border-border bg-surface/40 py-16 px-6">
      <div className="text-5xl mb-4 opacity-80" aria-hidden>{icon}</div>
      <h3 className="text-white font-semibold text-lg mb-1.5">{title}</h3>
      <p className="text-dim text-sm max-w-sm mb-5">{message}</p>
      {children}
    </div>
  )
}

export function EmptyState({
  icon, title, message, action,
}: { icon: string; title: string; message: string; action?: ReactNode }) {
  return <Shell icon={icon} title={title} message={message}>{action}</Shell>
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <Shell icon="⚠️" title="Couldn't load" message={message || 'Something went wrong fetching your data.'}>
      <button
        onClick={onRetry}
        className="rounded-lg bg-accent2 text-white text-sm font-medium px-4 py-2 hover:brightness-110 transition-all"
      >
        ↻ Refresh
      </button>
    </Shell>
  )
}
```

- [ ] **Step 2: Build**

Run: `cd dashboard && npm run build`
Expected: PASS (new file, no consumers yet — confirms it compiles).

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/StateViews.tsx
git commit -m "feat(dashboard): shared EmptyState + ErrorState components"
```

---

## Task 3: Unified responsive `Header`

**Files:**
- Modify: `dashboard/src/components/Header.tsx` (full rewrite below)

- [ ] **Step 1: Rewrite `Header.tsx`**

```tsx
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
              <div><InstallButton /></div>
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
```

- [ ] **Step 2: Build**

Run: `cd dashboard && npm run build`
Expected: FAIL — `SubjectShell.tsx` still calls `<Header>` without the now-required `onRules`
prop (type error). That's expected; Task 6 fixes the caller. If you want a green build here,
do Task 6 immediately after. (Order 3 → 4 → 5 → 6 all touch Header callers; build goes green
once Task 6 lands. Commit this task regardless — the component itself is correct.)

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/Header.tsx
git commit -m "feat(dashboard): responsive header with mobile burger + side panel"
```

---

## Task 4: `/rules` page + route

**Files:**
- Create: `dashboard/src/components/RulesPage.tsx`
- Modify: `dashboard/src/App.tsx`

- [ ] **Step 1: Create `RulesPage.tsx`**

The `RulesPanel` already renders its own "Global rules" heading + description for
`subjectId={null}`, so the page doesn't repeat it. Full container width (no `max-w-3xl`).
```tsx
import { useNavigate } from 'react-router-dom'
import { Header } from './Header'
import { RulesPanel } from './RulesPanel'
import type { Subject } from '../types'

interface Props {
  subjects: Subject[]
  onLogout: () => void
}

export function RulesPage({ subjects, onLogout }: Props) {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Header
        subjects={subjects}
        onHome={() => navigate('/')}
        onRules={() => navigate('/rules')}
        onLogout={onLogout}
      />
      <main className="flex-1 px-6 md:px-12 pt-8 pb-12">
        <RulesPanel subjectId={null} />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Add the route in `App.tsx`**

Add the import near the other component imports:
```tsx
import { RulesPage } from './components/RulesPage'
```
Add a route inside `<Routes>` (before the `path="*"` catch-all):
```tsx
      <Route path="/rules" element={<RulesPage subjects={subjects} onLogout={logout} />} />
```

- [ ] **Step 3: Build**

Run: `cd dashboard && npm run build`
Expected: still FAIL on the `SubjectCards`/`SubjectShell` Header calls (fixed in Tasks 5–6).
`RulesPage` itself must contribute no new errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/RulesPage.tsx dashboard/src/App.tsx
git commit -m "feat(dashboard): global rules page at /rules"
```

---

## Task 5: `SubjectCards` — shared header, remove RulesPanel, empty/error

**Files:**
- Modify: `dashboard/src/components/SubjectCards.tsx` (full rewrite below)
- Modify: `dashboard/src/App.tsx`

- [ ] **Step 1: Rewrite `SubjectCards.tsx`**

```tsx
import { useNavigate } from 'react-router-dom'
import type { Subject } from '../types'
import { Header } from './Header'
import { InstallButton } from './InstallButton'
import { EmptyState, ErrorState } from './StateViews'

interface Props {
  subjects: Subject[]
  error: string | null
  onReload: () => void
  onSelect: (id: string) => void
  onLogout: () => void
}

export function SubjectCards({ subjects, error, onReload, onSelect, onLogout }: Props) {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Header
        subjects={subjects}
        onHome={() => navigate('/')}
        onRules={() => navigate('/rules')}
        onLogout={onLogout}
      />
      <main className="flex-1 px-6 md:px-12 pt-8 pb-12">
        {error ? (
          <ErrorState message={error} onRetry={onReload} />
        ) : subjects.length === 0 ? (
          <EmptyState
            icon="📚"
            title="No subjects yet"
            message="Start a session in Claude and say what you want to learn."
            action={<InstallButton />}
          />
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {subjects.map(s => (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className="bg-surface border border-border rounded-xl p-5 text-left hover:border-border2 transition-colors"
              >
                <div className="flex justify-between items-start mb-3">
                  <span className="text-white font-semibold text-lg leading-tight capitalize">
                    {s.name.replace(/-/g, ' ')}
                  </span>
                  {s.streak > 0 && (
                    <span className="text-orange-400 font-bold text-sm ml-2 shrink-0">{s.streak}🔥</span>
                  )}
                </div>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-3xl font-bold text-white">{s.completion ?? 0}%</span>
                  <span className="text-dim text-sm">complete</span>
                </div>
                <div className="h-1 bg-border rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${s.completion ?? 0}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
                  />
                </div>
                <div className="flex gap-3 text-sm">
                  <span className="text-muted">{s.completed}/{s.totalTopics} completed</span>
                  {s.dueToday > 0 && (
                    <span className="text-orange-400 font-semibold">{s.dueToday} due ⚡</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Update the `SubjectCards` usage in `App.tsx`**

`App` already calls `const { subjects, loaded, error, reload } = useDashboard(...)` — the
`error` and `reload` are available (verify they're destructured; add them if not). Change the
`/` route element to pass them:
```tsx
      <Route
        path="/"
        element={
          <SubjectCards
            subjects={subjects}
            error={error}
            onReload={reload}
            onSelect={id => navigate(`/s/${id}/topics`)}
            onLogout={logout}
          />
        }
      />
```
Confirm the hook destructure line reads:
```tsx
  const { subjects, loaded: dashLoaded, error, reload } = useDashboard(!!session)
```
(The existing code uses `loaded: dashLoaded`; keep that alias. Add `error, reload` if missing.)

- [ ] **Step 3: Build**

Run: `cd dashboard && npm run build`
Expected: still FAIL only on `SubjectShell`'s Header call (Task 6). `SubjectCards` + `App`
contribute no errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/SubjectCards.tsx dashboard/src/App.tsx
git commit -m "feat(dashboard): home uses shared header + subjects empty/error state"
```

---

## Task 6: `SubjectShell` — shared header, per-tab empty/error, full-width Rules

**Files:**
- Modify: `dashboard/src/components/SubjectShell.tsx` (full rewrite below)

- [ ] **Step 1: Rewrite `SubjectShell.tsx`**

```tsx
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTopics, useTouches, useSubjectContext } from '../hooks/useSubject'
import { Header } from './Header'
import { TopicsView } from './views/TopicsView'
import { SessionsView } from './views/SessionsView'
import { MethodsView } from './views/MethodsView'
import { TopicPanel } from './TopicPanel'
import { RulesPanel } from './RulesPanel'
import { EmptyState, ErrorState } from './StateViews'
import type { Subject } from '../types'

type Tab = 'topics' | 'sessions' | 'methods' | 'rules'

const TABS: { id: Tab; label: string }[] = [
  { id: 'topics', label: 'Topics' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'methods', label: 'Methods' },
  { id: 'rules', label: 'Rules' },
]

interface Props {
  subjects: Subject[]
  onLogout: () => void
}

export function SubjectShell({ subjects, onLogout }: Props) {
  const { subjectId, tab, topicId } = useParams()
  const navigate = useNavigate()

  const activeSubject = subjects.find(s => s.id === subjectId) ?? null

  // The Rules tab needs none of this data — skip those fetches while it's active.
  const dataSubjectId = tab === 'rules' ? null : (subjectId ?? null)
  const { topics, loading: topicsLoading, error: topicsError, reload: reloadTopics } = useTopics(dataSubjectId)
  const { touches, loading: touchesLoading, error: touchesError, reload: reloadTouches } = useTouches(dataSubjectId)
  const { context, error: contextError, reload: reloadContext } = useSubjectContext(dataSubjectId)

  // Unknown subject in the URL (e.g. stale link) → back to subject cards
  if (!activeSubject) return <Navigate to="/" replace />
  // Unknown tab in the URL → normalize to the default tab
  if (!TABS.some(t => t.id === tab)) return <Navigate to={`/s/${subjectId}/topics`} replace />

  const activeTab = tab as Tab
  const openTopic = (id: string) => navigate(`/s/${subjectId}/${activeTab}/topic/${id}`)
  const closeTopic = () => navigate(`/s/${subjectId}/${activeTab}`)
  const loading = topicsLoading || touchesLoading

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header
        subjects={subjects}
        activeId={activeSubject.id}
        onSubjectChange={id => navigate(`/s/${id}/topics`)}
        onHome={() => navigate('/')}
        onRules={() => navigate('/rules')}
        onLogout={onLogout}
        streak={context?.streak ?? activeSubject.streak ?? 0}
      />

      {/* Tabs */}
      <nav className="flex border-b border-border px-6 md:px-12">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => navigate(`/s/${subjectId}/${t.id}`)}
            className={`px-4 py-3 text-base font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? 'text-accent border-accent'
                : 'text-dim border-transparent hover:text-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-6 md:px-12 pt-5 pb-10 min-h-0">
        {loading && activeTab !== 'rules' ? (
          <div className="flex items-center justify-center h-32 text-dim">Loading…</div>
        ) : (
          <>
            {activeTab === 'topics' && (
              topicsError
                ? <ErrorState message={topicsError} onRetry={reloadTopics} />
                : topics.length === 0
                  ? <EmptyState icon="🗂" title="No topics here" message="This subject has no topics yet." />
                  : <TopicsView topics={topics} onOpenTopic={openTopic} />
            )}
            {activeTab === 'sessions' && (
              touchesError
                ? <ErrorState message={touchesError} onRetry={reloadTouches} />
                : touches.length === 0
                  ? <EmptyState icon="🕒" title="No sessions yet" message="Your review history will show up here." />
                  : <SessionsView touches={touches} topics={topics} streak={context?.streak ?? 0} onOpenTopic={openTopic} />
            )}
            {activeTab === 'methods' && (
              contextError
                ? <ErrorState message={contextError} onRetry={reloadContext} />
                : !context || Object.keys(context.methodEffectiveness ?? {}).length === 0
                  ? <EmptyState icon="📊" title="No method data yet" message="Method stats appear after a few sessions." />
                  : <MethodsView context={context} subjectName={activeSubject.name} />
            )}
            {activeTab === 'rules' && (
              <RulesPanel subjectId={activeSubject.id} title={`Rules for ${activeSubject.name.replace(/-/g, ' ')}`} />
            )}
          </>
        )}
      </main>

      <TopicPanel topicId={topicId ?? null} onClose={closeTopic} />
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `cd dashboard && npm run build`
Expected: PASS — all Header callers now pass `onRules`; the build goes green here.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/SubjectShell.tsx
git commit -m "feat(dashboard): subject tabs get empty/error states + full-width rules"
```

---

## Task 7: `RulesPanel` — empty/error states

**Files:**
- Modify: `dashboard/src/components/RulesPanel.tsx`

- [ ] **Step 1: Import the shared components**

At the top of `dashboard/src/components/RulesPanel.tsx`, add:
```tsx
import { EmptyState, ErrorState } from './StateViews'
```
And change the hook destructure to include `error` + `reload`:
```tsx
  const { rules, loading, error, add, update, remove, reload } = useRules(subjectId)
```

- [ ] **Step 2: Replace the list body's loading/empty branch**

Find the block that currently renders:
```tsx
      {loading && rules.length === 0 ? (
        <div className="text-dim text-sm py-4">Loading…</div>
      ) : rules.length === 0 ? (
        <div className="text-faint text-sm py-4">No rules yet.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map(r => (
```
Replace only the branch conditions (keep the `rules.map(...)` list unchanged) with:
```tsx
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && rules.length === 0 ? (
        <div className="text-dim text-sm py-4">Loading…</div>
      ) : rules.length === 0 ? (
        <EmptyState
          icon="◈"
          title="No rules yet"
          message="Add a rule to steer how sessions run."
          action={
            <button
              onClick={() => setEditing('new')}
              className="rounded-lg bg-accent2 text-white text-sm font-medium px-4 py-2 hover:brightness-110 transition-all"
            >
              + Add rule
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map(r => (
```
(The rest of the `.map` body and the closing of the ternary stay exactly as they are.)

- [ ] **Step 3: Build**

Run: `cd dashboard && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/RulesPanel.tsx
git commit -m "feat(dashboard): rules panel empty + error states"
```

---

## Task 8: Final build + manual verification checklist

**Files:** none.

- [ ] **Step 1: Clean build**

Run: `cd dashboard && npm run build`
Expected: PASS, no type errors (only the pre-existing >500 kB chunk-size warning).

- [ ] **Step 2: Manual click-through (after deploy, or `npm run dev` locally)**

- Home: with subjects → grid; (simulate) zero subjects → 📚 empty state; kill network → ⚠ error + Refresh recovers.
- Subject → Topics / Sessions / Methods: each shows its empty state when there's no data; error + Refresh works offline.
- Subject → Rules tab: full width; empty → ◈ state with working "+ Add rule".
- `/rules` page: header "Rules" button navigates here; global rules panel spans full width.
- Resize to < 768px: burger appears; tap → panel slides in from the right; Rules/Connect/Sign out work; closes on backdrop click and Escape.

- [ ] **Step 3: No commit** (verification only). Note results in the task log.

---

## Notes for the implementer

- Build/verify from `dashboard/`: `npm run build`. There is no unit-test runner in this package.
- Tailwind tokens in use (`bg`, `surface`, `border`, `border2`, `accent`, `accent2`, `dim`, `faint`, `muted`) are defined in `dashboard/tailwind.config.js`. `md:` is Tailwind's default 768px breakpoint — no config change needed.
- `framer-motion` is already installed (imported by `TopicsView`, `TopicPanel`, `SessionPanel`).
- Tasks 3–5 intentionally leave the build red until Task 6 lands (all Header callers updated). Implement 3→4→5→6 in order; the build is green at Task 6 and stays green.
```
