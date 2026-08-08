# User Custom Rules — Design

Date: 2026-08-08
Status: Approved (design), pending implementation

## Goal

Let a user define **custom teaching rules** that steer how the learn assistant runs
sessions. Two scopes:

- **Global rules** — apply to every session, for every subject. Delivered to the agent
  in the `get_guide` tool response (the required first step of any session).
- **Per-subject rules** — apply only when that subject is selected. Delivered in the
  `get_subject_context` response (called once at the start of each subject session).

Rules are managed by the agent through a single tool (`manage_rules`) and are viewable /
editable by the user in the dashboard.

## Non-goals

- No rule ordering/priority beyond insertion order.
- No rule templating, variables, or conditional logic — rules are free-text instructions.
- No sharing of rules between users.
- No separate global-vs-subject tables; a single table with a nullable `subject_id`.

## Architecture context

- **Backend:** Supabase Postgres. RPC (Postgres) functions are the API, called both by
  the MCP Worker (REST `/rpc/<fn>` with the user JWT) and directly by the dashboard
  (`supabase-js`, user JWT). RLS enforces per-user isolation. Schema currently lives only
  in Supabase — **not** version-controlled. This design adds a `supabase/` migration dir
  to close that gap.
- **MCP Worker (`mcp/`):** thin proxy — every name in `RPC_FUNCTIONS` (`config.ts`)
  auto-registers as an MCP tool that forwards `params` to the matching RPC. Plus two local
  tools: `get_guide` (returns static `SKILL_TEXT`) and `dashboard_link`.
- **Dashboard (`dashboard/`):** Vite + React; calls RPCs directly via `rpc()`.

## Data model

New table `rules`:

| column      | type          | notes                                                        |
|-------------|---------------|--------------------------------------------------------------|
| id          | uuid PK       | `default gen_random_uuid()`                                  |
| user_id     | uuid NOT NULL | `default auth.uid()`; references `auth.users`                |
| subject_id  | uuid NULL     | references `subjects(id) on delete cascade`; NULL = global   |
| text        | text NOT NULL | the instruction                                              |
| active      | boolean       | `NOT NULL default true`; inactive rules are never injected   |
| created_at  | timestamptz   | `default now()`                                              |
| updated_at  | timestamptz   | `default now()`, bumped by trigger on update                 |

- **Scope is derived** from `subject_id` null-ness (NULL → global, else the subject).
  There is no separate `scope` column, so the two can never disagree. `scope` exists only
  as an API convenience on `list`.
- **RLS:** enabled; policies gate every operation on `user_id = auth.uid()`.
- **Ownership on subject-scoped writes:** `add` with a `subject_id` verifies that subject
  belongs to the caller (the FK plus subjects' own RLS make a cross-user `subject_id`
  unusable; the RPC also checks explicitly and raises a clear error).
- **Index:** `(user_id, subject_id, active)`.

## API — single tool `manage_rules`

A single Postgres RPC, auto-exposed as one MCP tool by adding `"manage_rules"` to
`RPC_FUNCTIONS`. Action discriminator handles all CRUD.

Signature:

```
manage_rules(
  p_action    text,               -- 'list' | 'add' | 'update' | 'delete'
  p_rule_id   uuid    default null,
  p_subject_id uuid   default null,
  p_scope     text    default null, -- 'global' | 'subject' | 'all' (list only)
  p_text      text    default null,
  p_active    boolean default null
) returns jsonb
```

Behavior:

- **list**
  - no `p_scope` / no `p_subject_id` → everything, grouped:
    `{ "global": [rule...], "subjects": { "<subjectId>": [rule...] } }`
  - `p_scope='global'` → `{ "global": [rule...] }`
  - `p_subject_id=<id>` → `{ "subjectId": "<id>", "rules": [rule...] }`
  - `list` returns **both active and inactive** rules (each row carries `active`) so the
    dashboard and "which rules do I have?" show the full set.
- **add** — requires `p_text`. Scope from `p_subject_id` (NULL → global). `active`
  defaults true. Returns the created row.
- **update** — requires `p_rule_id`. Patches `text` and/or `active` (whichever non-null).
  Returns the updated row.
- **delete** — requires `p_rule_id`. Returns `{ "deleted": true }`.

All actions are RLS-guarded; invalid/missing params raise a clear error the proxy surfaces
verbatim.

## Injection points (strictly separated; active rules only)

- **Global → `get_guide`** (Worker local tool). `get_guide` becomes async: it fetches the
  caller's global **active** rules via `manage_rules(list, scope=global)` using the session
  JWT, then appends a section to the returned guide:

  ```
  ## Your Personal Rules (global)
  These are standing instructions from the user. Honor them for the whole session.
  - <rule text>
  - ...
  ```

  If there are none, a one-line "No global rules set." note (keeps behavior explicit).

- **Subject → `get_subject_context`** (Postgres RPC). Extend its returned JSON with a
  `rules` array of that subject's **active** rules. Only subject rules here — global rules
  are already delivered by `get_guide`.

- **SKILL.md** documents both: where each set arrives, that the agent must obey them for the
  session, and how to manage them with `manage_rules` (including "which rules do I have?"
  → `list` with no scope).

## Code touch-list

**Backend / SQL (new `supabase/` dir, version-controlled):**
- `supabase/001_rules.sql` — table, RLS + policies, index, `updated_at` trigger.
- `supabase/002_manage_rules.sql` — the `manage_rules` RPC.
- `supabase/003_get_subject_context_rules.sql` — `CREATE OR REPLACE` of
  `get_subject_context` extending its return with `rules`. **Requires the current function
  body** (`SELECT pg_get_functiondef('get_subject_context'::regproc);`).

**MCP Worker:**
- `mcp/src/config.ts` — add `"manage_rules"` to `RPC_FUNCTIONS`.
- `mcp/src/agent.ts` — make `get_guide` async and inject global rules; give `manage_rules`
  a custom, action-aware tool description instead of the generic proxy text.
- `mcp/test/` — cover `manage_rules` proxying and `get_guide` global-rule injection.

**SKILL.md (single source of truth):**
- New "Custom Rules" section → regenerates `mcp/src/skill-text.generated.ts` via
  `scripts/sync-skill.mjs`.

**Dashboard:**
- `dashboard/src/types/index.ts` — `Rule` type.
- `dashboard/src/hooks/useRules.ts` — `useRules(subjectId | null)` (null = global);
  list/add/update/delete via `rpc('manage_rules', ...)`.
- `dashboard/src/components/RulesPanel.tsx` — one reusable panel: list rules, add, inline
  edit text, toggle `active`, delete.
- Wire the panel into the dashboard home (global) and `SubjectShell` (subject-scoped).

## Testing

- SQL: manual verification via Supabase after apply (CRUD round-trip, RLS denies
  cross-user, subject-scoped ownership check, `get_subject_context.rules` populated).
- Worker unit tests: `manage_rules` forwards params to the RPC; `get_guide` appends a
  global-rules section when rules exist and the "none" note when empty.
- Dashboard: manual — global panel on home, subject panel in shell; add/toggle/edit/delete
  reflect after refetch.

## Logistics / prerequisites

- **Supabase write access** — a Supabase MCP connection or access token / psql connection
  string, to apply the migrations. Not connected in the current session.
- **Current `get_subject_context` body** — to be pasted so `003_*.sql` extends it exactly.

## Rollout

1. Apply `001` + `002`; verify CRUD + RLS.
2. Apply `003` (after body is pasted); verify `rules` appears in `get_subject_context`.
3. Deploy Worker (config + get_guide + description) and regenerated skill text.
4. Deploy dashboard.
5. End-to-end: add a global rule + a subject rule in the dashboard, start a session, confirm
   the agent receives and honors both.
