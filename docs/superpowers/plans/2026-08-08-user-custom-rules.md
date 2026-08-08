# User Custom Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users define global and per-subject teaching rules that steer the learn assistant, managed by one `manage_rules` tool and editable in the dashboard.

**Architecture:** A single `rules` table (nullable `subject_id`; NULL = global) with RLS. One Postgres RPC `manage_rules` (action-discriminated CRUD) is auto-exposed as one MCP tool by the thin proxy. Global rules are injected into the `get_guide` tool response; per-subject rules into the `get_subject_context` RPC response. The dashboard reads/writes rules via the same RPC.

**Tech Stack:** Supabase Postgres (RPC + RLS), Cloudflare Worker (TypeScript, MCP SDK), Vitest, Vite + React + Tailwind dashboard.

**Prerequisites (confirm before Task 4):**
- Supabase write access — a Supabase MCP connection or `psql` connection string. If neither is available at apply time, the SQL from Tasks 1–3 is pasted into the Supabase SQL editor by the user.
- Repo is on `main`; work may be done directly or in a worktree.

---

## File Structure

**New (SQL, version-controlled):**
- `supabase/001_rules.sql` — `rules` table, index, RLS policies, `updated_at` trigger.
- `supabase/002_manage_rules.sql` — `_rule_json` helper + `manage_rules` RPC.
- `supabase/003_get_subject_context_rules.sql` — `CREATE OR REPLACE get_subject_context` adding `rules`.

**Modified (Worker):**
- `mcp/src/config.ts` — add `"manage_rules"` to `RPC_FUNCTIONS`.
- `mcp/src/skill.ts` — add pure `buildGuideText` helper + `GlobalRule` type.
- `mcp/src/agent.ts` — `get_guide` becomes async, injects global rules; custom `manage_rules` description.
- `mcp/test/mcp.test.ts` — assert `manage_rules` handler exists.
- `mcp/test/skill.test.ts` — test `buildGuideText`.

**Modified (skill source):**
- `SKILL.md` — new "Custom Rules" section → regenerate `mcp/src/skill-text.generated.ts`.

**New/Modified (dashboard):**
- `dashboard/src/types/index.ts` — `Rule` type.
- `dashboard/src/hooks/useRules.ts` — `useRules(subjectId | null)`.
- `dashboard/src/components/RulesPanel.tsx` — reusable rules editor.
- `dashboard/src/components/SubjectCards.tsx` — mount global `RulesPanel`.
- `dashboard/src/components/SubjectShell.tsx` — add "Rules" tab with subject `RulesPanel`.

---

## Task 1: SQL — `rules` table, RLS, trigger

**Files:**
- Create: `supabase/001_rules.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/001_rules.sql — user custom rules table.
CREATE TABLE IF NOT EXISTS public.rules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE,  -- NULL = global
  text       text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rules_user_subject_active_idx
  ON public.rules (user_id, subject_id, active);

ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rules_select ON public.rules;
DROP POLICY IF EXISTS rules_insert ON public.rules;
DROP POLICY IF EXISTS rules_update ON public.rules;
DROP POLICY IF EXISTS rules_delete ON public.rules;

CREATE POLICY rules_select ON public.rules FOR SELECT USING (user_id = auth.uid());
CREATE POLICY rules_insert ON public.rules FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY rules_update ON public.rules FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY rules_delete ON public.rules FOR DELETE USING (user_id = auth.uid());

-- Keep updated_at fresh on every UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rules_set_updated_at ON public.rules;
CREATE TRIGGER rules_set_updated_at
  BEFORE UPDATE ON public.rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/001_rules.sql
git commit -m "feat(db): rules table with RLS + updated_at trigger"
```

Note: not applied to Supabase yet — Task 4 applies all three migrations together.

---

## Task 2: SQL — `manage_rules` RPC

**Files:**
- Create: `supabase/002_manage_rules.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/002_manage_rules.sql — single CRUD RPC for rules + camelCase formatter.

-- Formats one rules row as the camelCase JSON the API/dashboard expect.
CREATE OR REPLACE FUNCTION public._rule_json(r public.rules)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'id',        r.id,
    'subjectId', r.subject_id,
    'text',      r.text,
    'active',    r.active,
    'createdAt', r.created_at,
    'updatedAt', r.updated_at
  );
$$;

-- Action-discriminated CRUD. SECURITY INVOKER (default) so RLS applies with the caller JWT.
CREATE OR REPLACE FUNCTION public.manage_rules(
  p_action     text,
  p_rule_id    uuid    DEFAULT NULL,
  p_subject_id uuid    DEFAULT NULL,
  p_scope      text    DEFAULT NULL,   -- 'global' | 'subject' | 'all' (list only)
  p_text       text    DEFAULT NULL,
  p_active     boolean DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.rules;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_action = 'list' THEN
    IF p_subject_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'subjectId', p_subject_id,
        'rules', COALESCE((
          SELECT jsonb_agg(public._rule_json(r) ORDER BY r.created_at)
          FROM public.rules r
          WHERE r.user_id = v_uid AND r.subject_id = p_subject_id
        ), '[]'::jsonb)
      );
    ELSIF p_scope = 'global' THEN
      RETURN jsonb_build_object(
        'global', COALESCE((
          SELECT jsonb_agg(public._rule_json(r) ORDER BY r.created_at)
          FROM public.rules r
          WHERE r.user_id = v_uid AND r.subject_id IS NULL
        ), '[]'::jsonb)
      );
    ELSE
      -- everything, grouped
      RETURN jsonb_build_object(
        'global', COALESCE((
          SELECT jsonb_agg(public._rule_json(r) ORDER BY r.created_at)
          FROM public.rules r
          WHERE r.user_id = v_uid AND r.subject_id IS NULL
        ), '[]'::jsonb),
        'subjects', COALESCE((
          SELECT jsonb_object_agg(sub.subject_id::text, sub.rules)
          FROM (
            SELECT r.subject_id,
                   jsonb_agg(public._rule_json(r) ORDER BY r.created_at) AS rules
            FROM public.rules r
            WHERE r.user_id = v_uid AND r.subject_id IS NOT NULL
            GROUP BY r.subject_id
          ) sub
        ), '{}'::jsonb)
      );
    END IF;

  ELSIF p_action = 'add' THEN
    IF p_text IS NULL OR length(btrim(p_text)) = 0 THEN
      RAISE EXCEPTION 'p_text is required for add';
    END IF;
    IF p_subject_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.subjects s WHERE s.id = p_subject_id AND s.user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'subject not found or not owned by user';
    END IF;
    INSERT INTO public.rules (user_id, subject_id, text, active)
    VALUES (v_uid, p_subject_id, btrim(p_text), COALESCE(p_active, true))
    RETURNING * INTO v_row;
    RETURN public._rule_json(v_row);

  ELSIF p_action = 'update' THEN
    IF p_rule_id IS NULL THEN
      RAISE EXCEPTION 'p_rule_id is required for update';
    END IF;
    IF p_text IS NOT NULL AND length(btrim(p_text)) = 0 THEN
      RAISE EXCEPTION 'p_text cannot be empty';
    END IF;
    UPDATE public.rules
      SET text   = COALESCE(btrim(p_text), text),
          active = COALESCE(p_active, active)
      WHERE id = p_rule_id AND user_id = v_uid
      RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'rule not found';
    END IF;
    RETURN public._rule_json(v_row);

  ELSIF p_action = 'delete' THEN
    IF p_rule_id IS NULL THEN
      RAISE EXCEPTION 'p_rule_id is required for delete';
    END IF;
    DELETE FROM public.rules
      WHERE id = p_rule_id AND user_id = v_uid
      RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'rule not found';
    END IF;
    RETURN jsonb_build_object('deleted', true, 'id', p_rule_id);

  ELSE
    RAISE EXCEPTION 'unknown action: %', p_action;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_rules(text, uuid, uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public._rule_json(public.rules) TO authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/002_manage_rules.sql
git commit -m "feat(db): manage_rules CRUD RPC (list/add/update/delete)"
```

---

## Task 3: SQL — extend `get_subject_context` with subject rules

**Files:**
- Create: `supabase/003_get_subject_context_rules.sql`

This is a `CREATE OR REPLACE` of the current function (see the spec appendix,
`docs/superpowers/specs/2026-08-08-user-custom-rules-design.md`) with one added key,
`rules`. Only that key is new; everything else is verbatim from the pasted body.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/003_get_subject_context_rules.sql
-- Adds active per-subject rules to get_subject_context. Only the 'rules' key is new.
CREATE OR REPLACE FUNCTION public.get_subject_context(p_subject_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$ SELECT json_build_object('id', s.id, 'name', s.name, 'streak', s.streak, 'currentLevel', s.current_level, 'methodEffectiveness', COALESCE((SELECT json_object_agg(me.method, json_build_object('avgScoreDelta', me.avg_score_delta, 'touches', me.touches, 'retired', me.retired)) FROM method_effectiveness me WHERE me.subject_id = p_subject_id AND me.user_id = auth.uid()), '{}'::json), 'dueTopics', COALESCE((SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'score', t.score, 'level', t.level, 'desiredScore', t.desired_score) ORDER BY t.score ASC) FROM topics t WHERE t.subject_id = p_subject_id AND t.next_review <= CURRENT_DATE AND t.status != 'completed' AND t.user_id = auth.uid()), '[]'::json), 'nextUnstarted', (SELECT json_build_object('id', t.id, 'name', t.name, 'score', t.score, 'level', t.level, 'desiredScore', t.desired_score) FROM topics t WHERE t.subject_id = p_subject_id AND t.status = 'not-started' AND t.level = s.current_level AND t.user_id = auth.uid() ORDER BY t.order_index ASC LIMIT 1), 'practiceCandidate', (SELECT json_build_object('id', t.id, 'name', t.name, 'score', t.score, 'level', t.level, 'desiredScore', t.desired_score) FROM topics t WHERE t.subject_id = p_subject_id AND t.score < t.desired_score AND t.status NOT IN (  'not-started', 'completed') AND (t.last_reviewed < CURRENT_DATE OR t.last_reviewed IS NULL) AND t.user_id = auth.uid() ORDER BY t.score ASC LIMIT 1), 'deepDiveCandidate', (SELECT json_build_object('id', t.id, 'name', t.name, 'score', t.score, 'level', t.level, 'desiredScore', t.desired_score) FROM topics t WHERE t.subject_id = p_subject_id AND t.score < t.desired_score AND t.status NOT IN ('not-started', 'completed') AND t.user_id = auth.uid() ORDER BY t.score ASC LIMIT 1), 'rules', COALESCE((SELECT json_agg(json_build_object('id', r.id, 'text', r.text, 'active', r.active) ORDER BY r.created_at ASC) FROM rules r WHERE r.subject_id = p_subject_id AND r.user_id = auth.uid() AND r.active = true), '[]'::json)) FROM subjects s WHERE s.id = p_subject_id AND s.user_id = auth.uid(); $function$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/003_get_subject_context_rules.sql
git commit -m "feat(db): get_subject_context returns active subject rules"
```

---

## Task 4: Apply migrations to Supabase + verify

**Files:** none (runs SQL against the live DB).

Use the Supabase MCP / `psql` connection. If unavailable, paste each file into the Supabase
SQL editor in order (001, 002, 003).

- [ ] **Step 1: Apply 001, 002, 003 in order.**

- [ ] **Step 2: Verify table + RLS exist**

Run (SQL editor or psql):
```sql
SELECT relrowsecurity FROM pg_class WHERE relname = 'rules';
-- Expected: t
SELECT count(*) FROM pg_policies WHERE tablename = 'rules';
-- Expected: 4
```

- [ ] **Step 3: Verify CRUD round-trip as an authenticated user.**

`manage_rules` relies on `auth.uid()`, which is NULL for the service role in the SQL editor —
so it must be called with a real user JWT. Easiest: log in to the dashboard
(`https://kisilov-vadim.github.io/learn/`), open the browser devtools console, and run
against the live `supabase` client:
```js
// add
let { data: added } = await window.__sb?.rpc?.('manage_rules', { p_action: 'add', p_text: 'test global rule' })
  ?? await (await import('/src/lib/supabase.ts')).supabase.rpc('manage_rules', { p_action: 'add', p_text: 'test global rule' })
console.log(added) // { id, subjectId:null, text:'test global rule', active:true, ... }
// list everything
console.log((await (await import('/src/lib/supabase.ts')).supabase.rpc('manage_rules', { p_action: 'list' })).data)
// → { global:[{...}], subjects:{} }
```
If a devtools import is awkward, instead defer this CRUD check to Task 10 Step 3 (the dashboard
round-trip), which exercises the same RPC through `useRules`. The catalog checks in Step 2 are
sufficient to confirm the objects exist.

- [ ] **Step 4: Verify `get_subject_context` includes `rules`**

The `rules` key is present even for the service role (the surrounding query just returns no
rows when `auth.uid()` is NULL). To confirm the shape, check via the dashboard console after
login:
```js
console.log((await (await import('/src/lib/supabase.ts')).supabase.rpc('get_subject_context', { p_subject_id: '<a real subject id you own>' })).data)
// → object now contains a "rules": [] (or populated) key
```

- [ ] **Step 5: No commit** (DB state only). Note the verification result in the task log.

---

## Task 5: Worker — register `manage_rules` tool

**Files:**
- Modify: `mcp/src/config.ts`
- Modify: `mcp/src/agent.ts`
- Test: `mcp/test/mcp.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `mcp/test/mcp.test.ts` inside the existing `describe("buildToolHandlers", ...)`:
```typescript
  it("registers a manage_rules handler that proxies params", async () => {
    const calls: any[] = [];
    const deps = {
      getJwt: vi.fn(async () => "jwt-r"),
      callRpc: vi.fn(async (_f: any, jwt: string, fn: string, params: any) => {
        calls.push({ jwt, fn, params }); return { ok: true };
      }),
      fetchImpl: vi.fn(),
    };
    const handlers = buildToolHandlers(deps as any, "grant-r");
    expect(Object.keys(handlers)).toContain("manage_rules");
    await handlers["manage_rules"]({ p_action: "list", p_scope: "global" });
    expect(calls[0]).toEqual({
      jwt: "jwt-r",
      fn: "manage_rules",
      params: { p_action: "list", p_scope: "global" },
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mcp && npx vitest run test/mcp.test.ts`
Expected: FAIL — `manage_rules` not in handler keys.

- [ ] **Step 3: Add `manage_rules` to the RPC list**

In `mcp/src/config.ts`, extend `RPC_FUNCTIONS`:
```typescript
export const RPC_FUNCTIONS = [
  "get_schema", "get_dashboard", "get_subject_context", "get_topic",
  "create_session", "end_session", "create_subject", "update_subject",
  "delete_subject", "add_topic", "update_topic", "add_touch", "update_methods",
  "query_topics", "query_touches", "query_sessions",
  "manage_rules",
] as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mcp && npx vitest run test/mcp.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Give `manage_rules` an action-aware tool description**

In `mcp/src/agent.ts`, replace the `describe` helper so `manage_rules` gets specific text
instead of the generic proxy line:
```typescript
    const describe = (fn: RpcFunction): string => {
      if (fn === "manage_rules") {
        return (
          "Manage the user's custom teaching rules (one tool, four actions via p_action). " +
          "list — p_action:'list' with no scope returns { global:[...], subjects:{ id:[...] } }; " +
          "p_scope:'global' returns only global; p_subject_id:<id> returns that subject's rules. " +
          "add — p_action:'add', p_text:<rule>, optional p_subject_id (omit for a global rule). " +
          "update — p_action:'update', p_rule_id:<id>, and p_text and/or p_active. " +
          "delete — p_action:'delete', p_rule_id:<id>. " +
          "Use 'list' (no scope) to answer 'which rules do I have?'."
        );
      }
      const nudge =
        fn === "get_dashboard" || fn === "get_schema" || fn === "get_subject_context"
          ? " IMPORTANT: if you have not already, call `get_guide` first to load how to run the session."
          : "";
      return (
        `learn: ${fn} — proxied Supabase RPC. Pass the p_* params documented in ` +
        `the guide from \`get_guide\`.${nudge}`
      );
    };
```

- [ ] **Step 6: Run the full worker test suite**

Run: `cd mcp && npx vitest run`
Expected: PASS (18 tests).

- [ ] **Step 7: Commit**

```bash
git add mcp/src/config.ts mcp/src/agent.ts mcp/test/mcp.test.ts
git commit -m "feat(mcp): expose manage_rules tool with action-aware description"
```

---

## Task 6: Worker — inject global rules into `get_guide`

**Files:**
- Modify: `mcp/src/skill.ts`
- Modify: `mcp/src/agent.ts`
- Test: `mcp/test/skill.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `mcp/test/skill.test.ts`:
```typescript
import { buildGuideText } from "../src/skill";

describe("buildGuideText", () => {
  it("appends a 'no global rules' note when there are none", () => {
    const out = buildGuideText("GUIDE", []);
    expect(out).toContain("GUIDE");
    expect(out).toContain("## Your Personal Rules (global)");
    expect(out).toContain("No global rules set.");
  });

  it("lists only active global rules as bullets", () => {
    const out = buildGuideText("GUIDE", [
      { text: "Always give a real-world example", active: true },
      { text: "Skip the Feynman close", active: false },
      { text: "Push harder on tradeoffs", active: true },
    ]);
    expect(out).toContain("- Always give a real-world example");
    expect(out).toContain("- Push harder on tradeoffs");
    expect(out).not.toContain("Skip the Feynman close");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mcp && npx vitest run test/skill.test.ts`
Expected: FAIL — `buildGuideText` not exported.

- [ ] **Step 3: Implement `buildGuideText` + `GlobalRule` in `skill.ts`**

Append to `mcp/src/skill.ts`:
```typescript
export interface GlobalRule {
  text: string;
  active: boolean;
}

// Appends the user's active global rules to the guide text returned by get_guide.
export function buildGuideText(skillText: string, globalRules: GlobalRule[]): string {
  const active = globalRules.filter((r) => r.active);
  const header = "\n\n## Your Personal Rules (global)\n\n";
  if (active.length === 0) {
    return skillText + header + "No global rules set.\n";
  }
  const body =
    "These are standing instructions from the user. Honor them for the whole session.\n\n" +
    active.map((r) => `- ${r.text}`).join("\n") +
    "\n";
  return skillText + header + body;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mcp && npx vitest run test/skill.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into the `get_guide` tool**

In `mcp/src/agent.ts`: update the import and make the `get_guide` handler async, fetching
global rules through the existing `manage_rules` proxy handler.

Change the skill import line to include the new symbols:
```typescript
import { SKILL_TEXT, SERVER_INSTRUCTIONS, buildGuideText, GlobalRule } from "./skill";
```

Replace the current `get_guide` registration with:
```typescript
    this.server.registerTool(
      "get_guide",
      {
        description:
          "REQUIRED FIRST STEP for any learning session. Returns the complete learn " +
          "teaching guide: the session decision tree, all 5 teaching methods, scoring " +
          "rules, and how to use every other tool. Call this before get_dashboard / " +
          "starting or continuing a session, and follow it exactly.",
        inputSchema: {},
      },
      async () => {
        let globalRules: GlobalRule[] = [];
        try {
          const data = (await handlers["manage_rules"]({
            p_action: "list",
            p_scope: "global",
          })) as { global?: GlobalRule[] };
          globalRules = data?.global ?? [];
        } catch {
          // If rules can't be loaded, still return the guide — the session must not break.
        }
        return {
          content: [{ type: "text" as const, text: buildGuideText(SKILL_TEXT, globalRules) }],
        };
      },
    );
```

- [ ] **Step 6: Run the full worker suite + typecheck the build**

Run: `cd mcp && npx vitest run && npx wrangler deploy --dry-run --outdir .wrangler/dry`
Expected: tests PASS (20 tests); dry-run build succeeds with no type errors.

- [ ] **Step 7: Commit**

```bash
git add mcp/src/skill.ts mcp/src/agent.ts mcp/test/skill.test.ts
git commit -m "feat(mcp): inject active global rules into get_guide response"
```

---

## Task 7: SKILL.md — document Custom Rules + regenerate

**Files:**
- Modify: `SKILL.md`
- Regenerate: `mcp/src/skill-text.generated.ts`

- [ ] **Step 1: Add the Custom Rules section**

Insert this section into `SKILL.md` immediately before the `## Key Rules` section (line ~336):
```markdown
## Custom Rules

The user can define custom rules that steer how you run sessions. They live in two scopes:

- **Global rules** — apply to every subject. They are appended to the `get_guide` response
  under "## Your Personal Rules (global)". Honor them for the entire session.
- **Per-subject rules** — apply only to the selected subject. They arrive in the
  `get_subject_context` response as a `rules` array (each `{ id, label, text }`). Honor them
  whenever you are working that subject.

Each rule has a short `label` (title) and an optional `text` (description/instruction).
Only active rules are ever delivered; treat every delivered rule as a standing user
instruction that overrides your default behavior where they conflict (user instructions win).

**Managing rules with `manage_rules`** (one tool, four actions via `p_action`):
- `list` — `p_action:"list"` with no scope returns everything grouped:
  `{ global:[...], subjects:{ "<subjectId>":[...] } }`. Use this to answer
  "which rules do I have?". `p_scope:"global"` returns only global rules;
  `p_subject_id:"<id>"` returns only that subject's rules ("which rules do I have for X?").
- `add` — `p_action:"add"`, `p_label:"<title>"`, optional `p_text:"<description>"`, and
  optional `p_subject_id` (omit for a global rule).
- `update` — `p_action:"update"`, `p_rule_id:"<id>"`, and any of `p_label` / `p_text` /
  `p_active` (set `p_active:false` to disable a rule without deleting it).
- `delete` — `p_action:"delete"`, `p_rule_id:"<id>"`.

When the user states a durable preference for how you should teach (e.g. "always give me a
real code example", "stop letting me skip the Feynman close"), offer to save it as a rule —
give it a short label plus the instruction as the description; global if it applies
everywhere, subject-scoped if it's specific to the current subject.
```

- [ ] **Step 2: Regenerate the embedded skill text**

Run: `cd mcp && npm run sync-skill`
Expected: `Synced SKILL.md (<N> chars) ...`, and `mcp/src/skill-text.generated.ts` updated.

- [ ] **Step 3: Confirm the generated file contains the new section**

Run: `cd mcp && grep -c "Custom Rules" src/skill-text.generated.ts`
Expected: `1` or more (non-zero).

- [ ] **Step 4: Run worker tests (skill text length assertions still hold)**

Run: `cd mcp && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add SKILL.md mcp/src/skill-text.generated.ts
git commit -m "docs(skill): document custom rules + manage_rules usage"
```

---

## Task 8: Dashboard — `Rule` type + `useRules` hook

**Files:**
- Modify: `dashboard/src/types/index.ts`
- Create: `dashboard/src/hooks/useRules.ts`

- [ ] **Step 1: Add the `Rule` type**

Append to `dashboard/src/types/index.ts`:
```typescript
export interface Rule {
  id: string
  subjectId: string | null
  label: string       // short title shown in the list
  text: string        // description / instruction, editable in the modal
  active: boolean
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 2: Create the hook**

Create `dashboard/src/hooks/useRules.ts`:
```typescript
import { useCallback, useEffect, useState } from 'react'
import { rpc } from '../lib/supabase'
import type { Rule } from '../types'

// subjectId === null → global rules; otherwise that subject's rules.
export function useRules(subjectId: string | null) {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const params = subjectId
      ? { p_action: 'list', p_subject_id: subjectId }
      : { p_action: 'list', p_scope: 'global' }
    rpc<{ global?: Rule[]; rules?: Rule[] }>('manage_rules', params)
      .then(data => setRules(subjectId ? (data?.rules ?? []) : (data?.global ?? [])))
      .finally(() => setLoading(false))
  }, [subjectId])

  useEffect(() => { load() }, [load])

  const add = useCallback(async (label: string, text: string) => {
    await rpc('manage_rules', {
      p_action: 'add',
      p_label: label,
      p_text: text,
      ...(subjectId ? { p_subject_id: subjectId } : {}),
    })
    load()
  }, [subjectId, load])

  const update = useCallback(async (id: string, patch: { label?: string; text?: string; active?: boolean }) => {
    await rpc('manage_rules', {
      p_action: 'update',
      p_rule_id: id,
      ...(patch.label !== undefined ? { p_label: patch.label } : {}),
      ...(patch.text !== undefined ? { p_text: patch.text } : {}),
      ...(patch.active !== undefined ? { p_active: patch.active } : {}),
    })
    load()
  }, [load])

  const remove = useCallback(async (id: string) => {
    await rpc('manage_rules', { p_action: 'delete', p_rule_id: id })
    load()
  }, [load])

  return { rules, loading, add, update, remove }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd dashboard && npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/types/index.ts dashboard/src/hooks/useRules.ts
git commit -m "feat(dashboard): Rule type + useRules hook"
```

---

## Task 9: Dashboard — reusable `RulesPanel` component

**Files:**
- Create: `dashboard/src/components/RulesPanel.tsx`

- [ ] **Step 1: Create the component**

Create `dashboard/src/components/RulesPanel.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { useRules } from '../hooks/useRules'
import type { Rule } from '../types'

interface Props {
  // null = global rules; otherwise the subject's rules
  subjectId: string | null
  title?: string
}

export function RulesPanel({ subjectId, title }: Props) {
  const { rules, loading, add, update, remove } = useRules(subjectId)
  // null = modal closed; 'new' = create mode; a Rule = edit mode
  const [editing, setEditing] = useState<Rule | 'new' | null>(null)

  const heading = title ?? (subjectId ? 'Subject rules' : 'Global rules')

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-white font-semibold text-lg">{heading}</h2>
        <button
          onClick={() => setEditing('new')}
          className="rounded-lg bg-accent2 text-white text-sm font-medium px-3.5 py-1.5 hover:brightness-110 transition-all"
        >
          + Add rule
        </button>
      </div>
      <p className="text-dim text-sm mb-4">
        {subjectId
          ? 'Applied only when studying this subject.'
          : 'Applied to every subject, every session.'}
      </p>

      {loading && rules.length === 0 ? (
        <div className="text-dim text-sm py-4">Loading…</div>
      ) : rules.length === 0 ? (
        <div className="text-faint text-sm py-4">No rules yet.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map(r => (
            <div
              key={r.id}
              className={`bg-bg rounded-lg px-3.5 py-2.5 flex items-center gap-3 ${r.active ? '' : 'opacity-50'}`}
            >
              <button
                onClick={() => update(r.id, { active: !r.active })}
                title={r.active ? 'Disable' : 'Enable'}
                className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${r.active ? 'bg-accent2' : 'bg-border2'}`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${r.active ? 'left-[18px]' : 'left-0.5'}`}
                />
              </button>
              <button
                onClick={() => setEditing(r)}
                className="flex-1 text-left text-[14px] font-medium text-white hover:text-accent transition-colors truncate"
              >
                {r.label}
              </button>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <RuleModal
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onCreate={async (label, text) => { await add(label, text); setEditing(null) }}
          onSave={async (id, text) => { await update(id, { text }); setEditing(null) }}
          onDelete={async (id) => { await remove(id); setEditing(null) }}
        />
      )}
    </div>
  )
}

function RuleModal({
  rule,
  onClose,
  onCreate,
  onSave,
  onDelete,
}: {
  rule: Rule | null // null = create mode
  onClose: () => void
  onCreate: (label: string, text: string) => Promise<void>
  onSave: (id: string, text: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const isNew = rule === null
  const [label, setLabel] = useState(rule?.label ?? '')
  const [text, setText] = useState(rule?.text ?? '')
  const [busy, setBusy] = useState(false)

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const canSave = isNew ? label.trim().length > 0 : true

  async function save() {
    if (busy || !canSave) return
    setBusy(true)
    try {
      if (isNew) await onCreate(label.trim(), text)
      else await onSave(rule!.id, text)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border2 rounded-2xl w-full max-w-lg p-6 relative"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          title="Close"
          className="absolute top-4 right-4 text-dim hover:text-white transition-colors text-lg"
        >
          ✕
        </button>

        {isNew ? (
          <input
            autoFocus
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Rule label (e.g. “Examples”)"
            className="w-full bg-bg border border-border2 rounded-lg text-lg font-semibold px-3.5 py-2.5 mb-4 outline-none text-white placeholder:text-faint focus:border-accent transition-colors"
          />
        ) : (
          <h3 className="text-white font-semibold text-xl mb-4 pr-8">{rule!.label}</h3>
        )}

        <label className="block text-dim text-sm mb-1.5">Description</label>
        <textarea
          autoFocus={!isNew}
          value={text}
          onChange={e => setText(e.target.value)}
          rows={5}
          placeholder="What should the assistant do? (optional)"
          className="w-full bg-bg border border-border2 rounded-lg text-[15px] px-3.5 py-2.5 outline-none text-white placeholder:text-faint focus:border-accent transition-colors resize-y"
        />

        <div className="flex items-center gap-2 mt-5">
          {!isNew && (
            <button
              onClick={() => onDelete(rule!.id)}
              className="text-red-400 hover:text-red-300 text-sm mr-auto"
            >
              Delete
            </button>
          )}
          <button
            onClick={onClose}
            className={`text-dim hover:text-white text-sm px-4 py-2 ${isNew ? 'ml-auto' : ''}`}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave || busy}
            className="rounded-lg bg-accent2 text-white text-sm font-medium px-4 py-2 disabled:opacity-40 hover:brightness-110 transition-all"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd dashboard && npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/RulesPanel.tsx
git commit -m "feat(dashboard): reusable RulesPanel (add/edit/toggle/delete)"
```

---

## Task 10: Dashboard — mount global + subject panels

**Files:**
- Modify: `dashboard/src/components/SubjectCards.tsx`
- Modify: `dashboard/src/components/SubjectShell.tsx`

- [ ] **Step 1: Mount the global panel on the home screen**

In `dashboard/src/components/SubjectCards.tsx`, add the import at the top:
```tsx
import { RulesPanel } from './RulesPanel'
```
Then add the panel below the subject grid. Replace the closing of the grid `div` and the
outer `div` so the panel renders after the cards:
```tsx
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

      <div className="mt-8 max-w-3xl">
        <RulesPanel subjectId={null} />
      </div>
    </div>
  )
}
```
(The final `</div>` and `)` / `}` shown here replace the original closing of the component.)

- [ ] **Step 2: Add a "Rules" tab to the subject shell**

In `dashboard/src/components/SubjectShell.tsx`:

Add the import:
```tsx
import { RulesPanel } from './RulesPanel'
```
Extend the `Tab` type and `TABS`:
```tsx
type Tab = 'topics' | 'sessions' | 'methods' | 'rules'

const TABS: { id: Tab; label: string }[] = [
  { id: 'topics', label: 'Topics' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'methods', label: 'Methods' },
  { id: 'rules', label: 'Rules' },
]
```
Render the panel in the content area — add this block alongside the other
`activeTab === ...` blocks, inside the `<>...</>`:
```tsx
            {activeTab === 'rules' && (
              <div className="max-w-3xl">
                <RulesPanel subjectId={activeSubject.id} title={`Rules for ${activeSubject.name.replace(/-/g, ' ')}`} />
              </div>
            )}
```
Note: the `rules` tab shows even while `topicsLoading || touchesLoading` gates the other
views. To let Rules render immediately, change the content guard so Rules is exempt:
```tsx
        {(topicsLoading || touchesLoading) && activeTab !== 'rules' ? (
          <div className="flex items-center justify-center h-32 text-dim">Loading…</div>
        ) : (
```

- [ ] **Step 3: Build the dashboard**

Run: `cd dashboard && npm run build`
Expected: `tsc -b` passes and `vite build` succeeds (no type errors, bundle emitted).

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/SubjectCards.tsx dashboard/src/components/SubjectShell.tsx
git commit -m "feat(dashboard): global rules on home + Rules tab per subject"
```

---

## Task 11: Deploy + end-to-end verification

**Files:** none.

- [ ] **Step 1: Deploy the Worker**

Run: `cd mcp && npx wrangler deploy`
Expected: deploys `learn-mcp` to `https://learn-mcp.djvadya16.workers.dev`.

- [ ] **Step 2: Deploy the dashboard**

Push to `main` (GH Pages Action publishes on `dashboard/**` changes), or trigger the deploy
workflow:
```bash
git push origin main
```
Expected: `.github/workflows/deploy.yml` runs; dashboard live at
`https://kisilov-vadim.github.io/learn/`.

- [ ] **Step 3: Dashboard round-trip**

In the dashboard: add a global rule on the home screen; open a subject → Rules tab → add a
subject rule; toggle one off; edit one; delete one. Confirm each change persists after a
refresh.

- [ ] **Step 4: Agent round-trip**

Reconnect the `learn` connector so the client re-reads the tools list (the `manage_rules`
tool and updated `get_guide` are cached client-side). Then:
- Call `get_guide` → confirm the response ends with "## Your Personal Rules (global)" listing
  the active global rule.
- Select the subject / call `get_subject_context` → confirm its JSON has a `rules` array with
  the active subject rule.
- Ask the agent "which rules do I have?" → confirm it calls `manage_rules` (list) and reports
  global + subject rules.

- [ ] **Step 5: Update the project memory**

Note in memory (`learn-remote-mcp`) that custom rules shipped: `rules` table + `manage_rules`
RPC, global rules injected in `get_guide`, subject rules in `get_subject_context`, dashboard
editors, and the new `supabase/` migration dir as the first version-controlled schema.

---

## Notes for the implementer

- **Run tests from `mcp/`** with `npx vitest run` (the `package.json` `test` script is a stub).
- **Worker type/build check:** `npx wrangler deploy --dry-run --outdir .wrangler/dry`.
- **Dashboard check:** `npm run build` (runs `tsc -b` then `vite build`).
- Tailwind color tokens used (`bg`, `surface`, `border`, `border2`, `accent`, `accent2`,
  `dim`, `faint`, `muted`) are defined in `dashboard/tailwind.config.js` — reuse, don't invent.
- SQL is not unit-tested locally (no local Postgres); Task 4 is the verification gate for
  Tasks 1–3. Do not proceed to Worker/dashboard tasks depending on live data until Task 4
  passes, though Tasks 5–10 can be written and unit-tested independently of the live DB.
```
