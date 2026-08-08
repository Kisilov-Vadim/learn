# Dashboard Empty/Error States + Rules Page + Responsive Header — Design

Date: 2026-08-08
Status: Approved (design), pending implementation

## Goal

Polish the learn dashboard:

1. **Empty states** for every place that can render zero data (subjects, topics, sessions,
   methods, rules) — one shared, site-styled component with per-entity copy.
2. **Error states** with a Refresh button, for every data fetch — same shared shell.
3. **Global rules on their own page** (`/rules`) with a header nav button, and the rules
   widget spanning the full page-container width.
4. **Responsive header** shared across all pages: a desktop nav (Rules / Connect / Sign out)
   that collapses on mobile into a burger opening an animated side panel.

## Non-goals

- No full responsive overhaul of the views (cards, accordions, panels, tables keep their
  current layout). Only the header/nav goes responsive.
- No new test runner (the dashboard has none today). Verification is `npm run build` +
  manual click-through.
- No change to the MCP worker, SQL, or SKILL.md.

## Architecture context

`dashboard/` is Vite + React + React Router + Tailwind, talking to Supabase RPCs via
`rpc()` (`src/lib/supabase.ts`). `useDashboard` already exposes
`{ subjects, loading, loaded, error, reload }`; the other hooks do not expose `error`/`reload`
yet. `framer-motion` is already a dependency (used in `TopicsView`, `TopicPanel`,
`SessionPanel`). There is currently **no responsive CSS** in the app and **no shared
empty/error UI** (only a search-empty line in `TopicsView`).

## 1. Data hooks — uniform result shape

Refactor these hooks to the `useDashboard` pattern — each returns its data plus
`loading`, `error: string | null`, and `reload: () => void`:

- `useTopics(subjectId)` → `{ topics, loading, error, reload }`
- `useTouches(subjectId)` → `{ touches, loading, error, reload }`
- `useSubjectContext(subjectId)` → `{ context, loading, error, reload }`
- `useTopic(topicId)` → `{ topic, loading, error, reload }`
- `useRules(subjectId)` → add `error` + `reload` to the existing
  `{ rules, loading, add, update, remove }`

Each wraps its fetch in try/catch, sets `error` to the thrown message, and clears it at the
start of each load. `reload` re-runs the fetch. Null id → no fetch, `error` stays null
(unchanged from today's guard behavior).

## 2. Shared state components — `src/components/StateViews.tsx`

A single presentational shell plus two exports:

- `EmptyState({ icon, title, message, action? })` — centered card
  (`bg-surface border border-border rounded-xl`), large emoji `icon`, white `title`, `text-dim`
  `message`, optional `action` (`{ label, onClick }`) rendered as an `accent2` button.
- `ErrorState({ message, onRetry })` — same shell with a `⚠` icon, the (truncated) error
  `message`, and a `↻ Refresh` button (`accent2`) calling `onRetry`.

Only existing Tailwind tokens (`bg`, `surface`, `border`, `border2`, `accent`, `accent2`,
`dim`, `faint`, `muted`). Sized to sit inside a view's content area (not full-screen).

Per-entity empty copy:

| Place            | icon | title              | message                                              | action        |
|------------------|------|--------------------|------------------------------------------------------|---------------|
| Subjects (home)  | 📚   | No subjects yet    | Start a session in Claude and say what you want to learn. | Connect * |
| Topics           | 🗂   | No topics here     | This subject has no topics yet.                      | —             |
| Sessions         | 🕒   | No sessions yet    | Your review history will show up here.               | —             |
| Methods          | 📊   | No method data yet | Method stats appear after a few sessions.            | —             |
| Rules            | ◈    | No rules yet       | Add a rule to steer how sessions run.                | + Add rule    |

\* Subjects "Connect" action opens the existing `InstallButton` connect modal. Simplest
implementation: render the empty message with the `InstallButton` component as its action
slot (it owns its own modal), rather than threading a callback.

## 3. Global Rules page — `/rules`

- New route `/rules` in `App.tsx` → `RulesPage` component: renders the shared header, then
  `<RulesPanel subjectId={null} />` inside a **full-width** page container (no `max-w-3xl`).
- Remove the global `RulesPanel` block from `SubjectCards` (home).
- The subject-scoped rules stay on the subject "Rules" tab; widen it to full width too
  (drop the `max-w-3xl` wrapper) for consistency.

## 4. Unified responsive header — `src/components/Header.tsx`

One header for home, subject, and rules pages.

Props: `{ subjects, activeId?, onSubjectChange?, streak?, onNavigate }` where `onNavigate`
exposes `home`/`rules`; logout comes from the existing `onLogout`. Router navigation is done
by the caller (pages already have `useNavigate`) or via an injected callback — keep the
header presentational, callers pass handlers.

Layout:
- **Left:** `Learn` wordmark (→ home) + subject `<select>` **only when `activeId` is set**
  (i.e. inside a subject). On home/rules the selector is hidden.
- **Right, desktop (`≥ md`):** `Rules` nav button, then `Connect` (`InstallButton`), then
  `Sign out`; `streak` pill when > 0. `Rules` is left of `Connect`. Use `hidden md:flex`.
- **Right, mobile (`< md`):** a `☰` burger (`md:hidden`). Tapping it opens a side panel.

Mobile side panel (framer-motion):
- Fixed overlay: dimmed backdrop (`bg-black/60`) + a right-anchored panel
  (`w-72 max-w-[80%] h-full bg-surface border-l border-border`).
- Animate panel `x: '100%' → 0` on open, back on close (`transition ~0.25s easeInOut`);
  backdrop fades. Use `AnimatePresence` so exit animates.
- Contents (stacked): `Rules`, `Connect`, `Sign out`, and the streak.
- Close on backdrop click and on `Escape`; close after a nav action fires.

Breakpoint: Tailwind default `md` (768px). Add nothing to the config.

Refactor: `SubjectCards` drops its bespoke inline header and renders `<Header/>`;
`SubjectShell` swaps its current header usage for the shared one; `RulesPage` uses it too.

## 5. Wiring empty/error into views

Standard order per view: `error → <ErrorState onRetry={reload}/>`, else
`empty → <EmptyState .../>`, else content. Loading keeps the existing "Loading…" text.

- **SubjectCards:** `useDashboard` `error` → ErrorState(reload); `subjects.length === 0` →
  EmptyState(subjects); else the grid.
- **SubjectShell → Topics:** `useTopics` error/empty. (Keep the existing loading guard;
  the rules-tab exemption stays.)
- **SubjectShell → Sessions:** `useTouches`/`useSubjectContext` error; `touches.length === 0`
  → EmptyState(sessions).
- **SubjectShell → Methods:** `useSubjectContext` error; empty `methodEffectiveness` →
  EmptyState(methods).
- **RulesPanel:** `useRules` error → ErrorState(reload); `rules.length === 0` (not loading)
  → EmptyState(rules, action `+ Add rule` opens the create modal). The panel keeps its
  header `+ Add rule` button in all states.

## Components / files

Create:
- `dashboard/src/components/StateViews.tsx` — `EmptyState`, `ErrorState`.
- `dashboard/src/components/RulesPage.tsx` — `/rules` page.

Modify:
- `dashboard/src/hooks/useSubject.ts` — add `error`/`reload` to all four hooks.
- `dashboard/src/hooks/useRules.ts` — add `error`/`reload`.
- `dashboard/src/components/Header.tsx` — unified responsive header + mobile side panel.
- `dashboard/src/App.tsx` — add `/rules` route; ensure header nav wiring.
- `dashboard/src/components/SubjectCards.tsx` — shared header, remove RulesPanel, empty/error.
- `dashboard/src/components/SubjectShell.tsx` — shared header, per-tab empty/error, full-width
  rules tab.
- `dashboard/src/components/RulesPanel.tsx` — empty/error states, full-width friendly.

## Testing

- `cd dashboard && npm run build` (tsc -b + vite build) must pass after each task.
- Manual click-through (post-deploy): home with/without subjects; a subject's Topics/
  Sessions/Methods/Rules tabs; `/rules` page; force an error (offline) → Refresh recovers;
  resize to mobile → burger opens the animated panel, nav works, closes on backdrop/Escape.

## Rollout

Single dashboard change set on `feat/dashboard-states-nav`; build, review, merge to `main`,
push → GH Pages auto-deploys. No worker/DB/deploy coordination needed.
