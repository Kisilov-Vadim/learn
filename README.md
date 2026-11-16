# learn

Personal adaptive learning system — spaced repetition + 5 teaching methods,
usable from Claude Desktop, mobile, web, and Claude Code via one hosted MCP server.

## Layout

| Path | What |
|---|---|
| `SKILL.md` | **Single source of truth** for the teaching guide (methods, decision tree, scoring). Embedded into the MCP server by `mcp/scripts/sync-skill.mjs`. |
| `mcp/` | Cloudflare Worker — remote MCP server. OAuth-proxies to Supabase, exposes the data tools + `get_guide` tool + `learn` prompt. Deployed at `learn-mcp.djvadya16.workers.dev`. |
| `dashboard/` | Vite/React progress dashboard + OAuth login UI + install instructions. Served at `kisilov-vadim.github.io/learn/` via GitHub Pages. |
| `supabase/` | Incremental SQL migrations (rules, topic description). The base schema (subjects/topics/touches/sessions) predates the folder and lives only in the remote DB. |
| `docs/` | Design specs + implementation plans. |

## Data model notes

- **Topic** fields: `name`, `description` (markdown, shown in the dashboard topic panel), `level`, `score`, `desiredScore`, `status` (`not-started` / `learning` / `completed`), `nextReview`, `lastReviewed`, `bestMethod`, `reviewCount`, `prerequisites`, `resources` (`[{type, title, url}]`).
- `add_topic` takes `p_description`; `update_topic` accepts `description` in `p_patch` (`""` clears). `get_topic` returns it; `query_topics` does not (list view stays light).

## Install (end users)

- **Claude Desktop / mobile / web:** Settings → Connectors → Add custom connector →
  `https://learn-mcp.djvadya16.workers.dev/mcp` → log in once.
- **Claude Code:** `claude mcp add --transport http learn https://learn-mcp.djvadya16.workers.dev/mcp`

## Develop

```bash
# MCP server
cd mcp && npm install && npm test && npx wrangler deploy
# after editing ../SKILL.md, regenerate the embedded guide:
node scripts/sync-skill.mjs

# Dashboard
cd dashboard && npm install && npm run build   # deploys via GH Pages Action on push to main

# DB migration (Supabase CLI, logged in; run from any scratch dir)
supabase link --project-ref wmbtdzlcqgdfqdxvaqeb
supabase db query --linked -f supabase/004_topic_description.sql
```

Deploy order for schema changes: **DB migration → MCP worker (guide text) → dashboard**. New columns must be nullable/defaulted so old clients keep working.
