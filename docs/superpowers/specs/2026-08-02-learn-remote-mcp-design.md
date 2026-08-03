# Learn — Remote MCP for Claude Desktop / Mobile / Web

**Date:** 2026-08-02
**Status:** Approved design, pending spec review
**Author:** Vadim Kisilov

## Problem

The `learn` plugin works only in Claude Code. Its data/auth layer is two local
scripts:

- `scripts/api.sh` — bash + curl wrapper calling Supabase RPC.
- `scripts/auth.js` — Node helper that stores a token at `~/.claude/learn/auth.json`
  and runs a local HTTP server on port 3333 to capture the browser login.

Claude Desktop, mobile, and web have no local Bash/Node against the user's
machine and no `~/.claude` filesystem, so none of this runs there. The teaching
logic in `SKILL.md` is fully portable; only the data/auth layer is stuck to the
CLI.

## Goal

One hosted remote MCP server that makes `learn` fully usable on Claude Desktop,
mobile, web, **and** Claude Code — sharing one backend so learning state
continues across devices. Install per platform must be a single step. No billing
system. The Supabase backend stays unchanged.

## Decisions (locked)

1. **Hosting:** Cloudflare Workers. First-class remote-MCP + OAuth support
   (`workers-oauth-provider`, KV token store), free at small traffic, one-command
   deploy.
2. **Auth:** The Worker is the OAuth server for Claude and an OAuth *proxy* to
   Supabase. It authenticates the user against Supabase behind the scenes (reusing
   the existing dashboard login) and holds the Supabase refresh token server-side.
   Supabase does not need to be a public OAuth provider.
3. **Scope:** Converge on the MCP. Both Claude Code and Desktop use the same
   remote MCP. The `api.sh` / `auth.js` scripts are deleted. Single data path.
4. **Instructions delivery:** Bake the full teaching flow into the MCP server —
   no separate skill install anywhere. Delivered three ways:
   - Server `instructions` field (auto-loaded on connect → agents know the app
     exists and how to start, even by natural language on mobile).
   - An MCP prompt named `learn` returning the entire current `SKILL.md` (the
     deep flow; the `/learn` entry point).
   - Rich per-tool descriptions for the RPC operations.
5. **Single source of truth:** `SKILL.md` remains the file. The Worker embeds its
   exact text at build time. Edit skill → redeploy → CLI and Desktop both update.
   No drift.

## Architecture

```
┌─────────────────┐        OAuth (PKCE) + MCP (streamable HTTP)
│ Claude clients  │───────────────────────────────────────────┐
│ Desktop/mobile/ │                                            │
│ web / Claude Code│                                           ▼
└─────────────────┘                             ┌──────────────────────────┐
        ▲                                        │ Cloudflare Worker        │
        │ browser login (once)                   │  learn-mcp               │
        ▼                                        │                          │
┌─────────────────┐   POST session               │ - OAuth server (lib)     │
│ Learn dashboard │─────────────────────────────▶│ - MCP: tools + prompt +  │
│ (GitHub Pages)  │   to Worker callback          │   instructions           │
│ Supabase login  │                               │ - RPC proxy              │
└─────────────────┘                               │ - KV: token store        │
        │                                          └──────────┬───────────────┘
        │ Supabase auth                                       │ Bearer <supabase jwt>
        ▼                                                     ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ Supabase (unchanged): RPC functions, per-user RLS, email/password auth      │
└───────────────────────────────────────────────────────────────────────────┘
```

### Components

**A. Cloudflare Worker `learn-mcp`** — the only new deployable.
- **OAuth server** (via `workers-oauth-provider`): implements `/authorize`,
  `/token`, PKCE, client registration, and its own opaque token issuance. Token
  material stored in KV.
- **Upstream login handler**: the `/authorize` step does not render a login form.
  It generates a `state`, stores the pending OAuth request in KV, and redirects
  the browser to the dashboard: `…/learn-dashboard/?mcp_state=<state>`.
- **Supabase callback** `POST /supabase-callback`: receives `{ state,
  access_token, refresh_token, expires_at }` from the dashboard. Validates the
  `state`, stores the Supabase session keyed to the pending request, mints the MCP
  authorization code, and returns the Claude redirect URL for the browser to
  follow.
- **MCP endpoint** `/mcp` (streamable HTTP transport): exposes
  - server `instructions` (short standing hint),
  - one prompt `learn` (full `SKILL.md` text),
  - tools mirroring the Supabase RPC (below).
- **RPC proxy**: per tool call, look up the Supabase session bound to the caller's
  MCP token, refresh the Supabase access token if within 60s of expiry, then
  `POST https://<supabase>/rest/v1/rpc/<fn>` with `Authorization: Bearer
  <supabase jwt>` + `apikey`. Return the JSON result.
- **KV namespaces**: OAuth token store (managed by the library) + a map from MCP
  token → Supabase `{ refresh_token, access_token, expires_at }`.

**B. Learn dashboard (existing React app on GitHub Pages)** — small additions:
- On load with `?mcp_state=<state>`, after a successful Supabase session, POST the
  session to the Worker's `/supabase-callback` (mirrors today's `notifyCli`
  localhost POST — same shape, new URL), then redirect the browser to the Claude
  redirect URL the callback returns.
- An "Add to Claude Desktop" card: copyable connector URL + the 3 install steps.
- The old `notifyCli` → `localhost:3333` path is removed once the CLI stops using
  local auth.

**C. Supabase** — unchanged. Same RPC, same RLS, same email/password.

**D. `learn` plugin repo** — `api.sh` and `auth.js` deleted. `SKILL.md` updated so
its operations reference MCP tools (Claude Code registers the remote MCP via the
plugin's `mcpServers` declaration, so `/learn` still works with one
`plugin install`). `SKILL.md` text is the build-time source for the Worker's
`learn` prompt.

## Tool surface (MCP tools ↔ Supabase RPC)

One MCP tool per RPC function already used in `SKILL.md`:

`get_schema`, `get_dashboard`, `get_subject_context`, `get_topic`,
`create_session`, `end_session`, `create_subject`, `update_subject`,
`delete_subject`, `add_topic`, `update_topic`, `add_touch`, `update_methods`.

Each tool: typed input schema matching the RPC's `p_*` params, description carrying
the usage note from `SKILL.md`, passes the body straight through to the RPC proxy.

## Auth flow (detailed)

```
1. User adds connector URL in a Claude client (PKCE OAuth begins).
2. Client → Worker /authorize.  Worker stores pending request + state in KV,
   redirects browser → dashboard?mcp_state=<state>.
3. User logs into Supabase on the dashboard (same login as today).
4. Dashboard → POST /supabase-callback { state, access_token, refresh_token,
   expires_at }.
5. Worker validates state, stores Supabase session, mints MCP auth code,
   returns Claude redirect URL. Browser follows it back to the client.
6. Client → Worker /token (PKCE verifier) → Worker issues MCP access +
   refresh token, bound to the stored Supabase session.
7. Each tool call: client sends MCP token → Worker resolves Supabase session,
   refreshes JWT if needed, calls RPC with Bearer <supabase jwt>. RLS enforced.
```

Cross-device: because state lives in Supabase and the connector is account-level,
any authorized client continues the same learning state.

## Error handling

- **No/expired MCP token** → MCP returns an auth-required error; the client
  re-runs OAuth. No silent failure.
- **Supabase refresh fails** (revoked/expired refresh token) → Worker clears the
  KV binding and returns auth-required, forcing a fresh dashboard login.
- **RPC error** (RLS reject, bad params) → surface Supabase's error body verbatim
  in the tool result so the model can react (mirrors current `api.sh` behavior).
- **Callback validation**: reject callbacks with unknown/expired `state`; only
  accept over HTTPS. Same trust level as today's dashboard→localhost hand-off.
- **KV write failure** → fail the OAuth step with a retryable error rather than
  issuing a token with no backing session.

## Security notes

- The browser posts the Supabase refresh token to the Worker callback — locked to
  HTTPS and a validated one-time `state`; the dashboard only posts to the Worker
  origin. Equivalent to today's dashboard→localhost:3333 hand-off.
- Supabase anon/publishable key stays public (as now). RLS + per-user JWT is what
  protects data; the Worker never uses a service-role key.
- MCP tokens are opaque and independently revocable (drop the KV binding).

## Install (per platform, one step each)

- **Claude Desktop / mobile / web:** Settings → Connectors → Add custom connector
  → paste `https://learn-mcp.<host>.workers.dev/mcp` → log in once. (Requires a
  paid Anthropic plan — Anthropic's gate on custom connectors.)
- **Claude Code:** `claude plugin install learn` — the plugin declares the remote
  MCP, so the connector auto-registers; first `/learn` runs the browser OAuth
  once.

## Cost

- **End user:** only their existing Claude paid plan (Pro/Max/Team). $0 marginal
  to the operator; no billing to build.
- **Operator at small traffic:** $0 — Cloudflare Workers + KV free tier, Supabase
  free tier, dashboard on GitHub Pages.

## Out of scope

- Billing / paid tiers for the learn app.
- Migrating the Supabase backend or RPC signatures.
- A `claude://` one-click connector-add link (doesn't exist for custom connectors
  yet).
- Replacing email/password auth with social OAuth (possible later; not needed).

## Testing

- **Worker unit:** OAuth `/authorize`→callback→`/token` happy path; state
  validation rejects unknown/expired state; token→Supabase-session resolution;
  JWT refresh-on-expiry; RPC proxy passes params and surfaces errors.
- **Auth integration:** full browser flow against a Supabase test user; revoked
  refresh token forces re-login.
- **MCP contract:** `prompts/list`/`prompts/get` returns full `SKILL.md`;
  `tools/list` matches the RPC set; a representative tool call round-trips real
  data.
- **Cross-device:** authorize on one client, read the same dashboard state from a
  second.
- **Claude Code regression:** `plugin install` registers the connector; `/learn`
  runs end-to-end with the scripts removed.

## Rollout

1. Deploy Worker + KV; wire dashboard callback (keep `localhost:3333` temporarily).
2. Add remote MCP declaration to the plugin; update `SKILL.md` to MCP tools behind
   a check that the connector is present.
3. Cut Claude Code over to the MCP; delete `api.sh` / `auth.js` and the
   `localhost:3333` path.
4. Publish the Desktop connector URL + install card on the dashboard.
