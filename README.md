# learn

Personal adaptive learning system — spaced repetition + 5 teaching methods,
usable from Claude Desktop, mobile, web, and Claude Code via one hosted MCP server.

## Layout

| Path | What |
|---|---|
| `SKILL.md` | **Single source of truth** for the teaching guide (methods, decision tree, scoring). Embedded into the MCP server by `mcp/scripts/sync-skill.mjs`. |
| `mcp/` | Cloudflare Worker — remote MCP server. OAuth-proxies to Supabase, exposes the data tools + `get_guide` tool + `learn` prompt. Deployed at `learn-mcp.djvadya16.workers.dev`. |
| `dashboard/` | Vite/React progress dashboard + OAuth login UI + install instructions. Served at `kisilov-vadim.github.io/learn/` via GitHub Pages. |
| `docs/` | Design spec + implementation plan. |

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
```
