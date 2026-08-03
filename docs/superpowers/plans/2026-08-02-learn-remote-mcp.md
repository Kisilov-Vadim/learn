# Learn Remote MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a hosted Cloudflare Worker that exposes the `learn` backend as a remote MCP server (tools + teaching prompt + instructions) with OAuth-proxy auth to Supabase, making `learn` fully usable on Claude Desktop/mobile/web and Claude Code from one backend.

**Architecture:** A Cloudflare Worker fronts the existing Supabase project. `workers-oauth-provider` makes the Worker an OAuth server for Claude; its `/authorize` step delegates the actual login to the existing GitHub-Pages dashboard, which POSTs the resulting Supabase session back to a Worker callback. The Worker stores the Supabase refresh token in KV keyed to the MCP grant, and every MCP tool call proxies to a Supabase RPC with a fresh Supabase JWT. The full `SKILL.md` text is embedded at build time and served as an MCP prompt.

**Tech Stack:** Cloudflare Workers, `@cloudflare/workers-oauth-provider`, `agents` (McpAgent), `@modelcontextprotocol/sdk`, Workers KV, Wrangler, Vitest (`@cloudflare/vitest-pool-workers`). Dashboard: existing Vite/React app. Plugin: `SKILL.md` + `plugin.json`.

---

## Repository layout

**Actual on-disk locations (as of 2026-08-03):**
- Worker: `~/Desktop/else/learn/mcp/` (referred to below as `learn-mcp/`)
- Dashboard: `~/Desktop/else/learn/dashboard/` (was `~/Desktop/else/learn-dashboard`)
- Plugin: this repo (`~/.claude/plugins/manual/learn`)

The Cloudflare Worker *name* stays `learn-mcp` (→ `learn-mcp.<subdomain>.workers.dev`)
regardless of the folder name.

New Worker deploys independently of the plugin.

```
learn-mcp/
  wrangler.toml
  package.json
  tsconfig.json
  src/
    index.ts          # OAuthProvider wiring — the Worker entry
    login.ts          # default handler: /authorize redirect + /supabase-callback
    mcp.ts            # McpAgent: tools + prompt + instructions
    rpc.ts            # Supabase RPC proxy (pure, unit-tested)
    session.ts        # KV session store + JWT refresh (unit-tested)
    skill.ts          # build-time import of SKILL.md text
    config.ts         # constants (Supabase URL, anon key, dashboard URL)
  skill/SKILL.md      # copied/symlinked from plugin at build time
  test/
    rpc.test.ts
    session.test.ts
    mcp.test.ts
```

---

## Task 1: Scaffold the Worker project

**Files:**
- Create: `learn-mcp/package.json`
- Create: `learn-mcp/wrangler.toml`
- Create: `learn-mcp/tsconfig.json`
- Create: `learn-mcp/src/config.ts`

- [ ] **Step 1: Create the project and install deps**

Run:
```bash
mkdir -p learn-mcp/src learn-mcp/test learn-mcp/skill && cd learn-mcp
npm init -y
npm i @cloudflare/workers-oauth-provider agents @modelcontextprotocol/sdk zod
npm i -D wrangler typescript @cloudflare/vitest-pool-workers vitest @cloudflare/workers-types
```
Expected: `node_modules` populated, no install errors.

- [ ] **Step 2: Write `wrangler.toml`**

```toml
name = "learn-mcp"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "OAUTH_KV"
id = "PLACEHOLDER_FILL_AFTER_STEP_4"

[durable_objects]
bindings = [{ name = "MCP_OBJECT", class_name = "LearnMcp" }]

[[migrations]]
tag = "v1"
new_sqlite_classes = ["LearnMcp"]
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "es2022",
    "moduleResolution": "bundler",
    "lib": ["es2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

- [ ] **Step 4: Create the KV namespace and paste its id into `wrangler.toml`**

Run:
```bash
npx wrangler kv namespace create OAUTH_KV
```
Expected: prints an `id = "..."`. Replace `PLACEHOLDER_FILL_AFTER_STEP_4` with it.

- [ ] **Step 5: Write `src/config.ts`**

```ts
export const SUPABASE_URL = "https://wmbtdzlcqgdfqdxvaqeb.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_soBWDz8wvsusMhEdVLm-LA_gp6IQWhK";
export const DASHBOARD_URL = "https://kisilov-vadim.github.io/learn-dashboard/";
// Space-separated list of RPC functions the MCP is allowed to proxy.
export const RPC_FUNCTIONS = [
  "get_schema", "get_dashboard", "get_subject_context", "get_topic",
  "create_session", "end_session", "create_subject", "update_subject",
  "delete_subject", "add_topic", "update_topic", "add_touch", "update_methods",
] as const;
export type RpcFunction = (typeof RPC_FUNCTIONS)[number];
```

- [ ] **Step 6: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold learn-mcp Cloudflare Worker"
```

---

## Task 2: Supabase RPC proxy (pure, unit-tested)

**Files:**
- Create: `learn-mcp/src/rpc.ts`
- Test: `learn-mcp/test/rpc.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { callRpc } from "../src/rpc";

describe("callRpc", () => {
  it("POSTs to the rpc endpoint with bearer jwt and apikey, returns parsed json", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    const out = await callRpc(fetchMock as any, "jwt-123", "get_dashboard", undefined);
    expect(out).toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/rest/v1/rpc/get_dashboard");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer jwt-123");
    expect(headers["apikey"]).toBeTruthy();
  });

  it("sends the json body when params are given", async () => {
    const fetchMock = vi.fn(async () => new Response("null", { status: 200 }));
    await callRpc(fetchMock as any, "jwt", "get_topic", { p_topic_id: "abc" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ p_topic_id: "abc" });
  });

  it("throws with the supabase error body on non-2xx", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: "denied" }), { status: 401 }));
    await expect(callRpc(fetchMock as any, "jwt", "get_dashboard", undefined))
      .rejects.toThrow("denied");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/rpc.test.ts`
Expected: FAIL — cannot find `../src/rpc`.

- [ ] **Step 3: Write `src/rpc.ts`**

```ts
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

export async function callRpc(
  fetchImpl: typeof fetch,
  jwt: string,
  fn: string,
  params: Record<string, unknown> | undefined,
): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
    apikey: SUPABASE_ANON_KEY,
  };
  if (params !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetchImpl(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: params !== undefined ? JSON.stringify(params) : undefined,
  });

  const text = await res.text();
  const parsed = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = (parsed as any)?.message ?? text ?? `RPC ${fn} failed (${res.status})`;
    throw new Error(msg);
  }
  return parsed;
}

function safeJson(t: string): unknown {
  try { return JSON.parse(t); } catch { return t; }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/rpc.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rpc.ts test/rpc.test.ts && git commit -m "feat: supabase rpc proxy"
```

---

## Task 3: KV session store + JWT refresh (unit-tested)

Stores `{ access_token, refresh_token, expires_at }` per grant key and returns a valid Supabase JWT, refreshing when within 60s of expiry.

**Files:**
- Create: `learn-mcp/src/session.ts`
- Test: `learn-mcp/test/session.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { getValidJwt, type SupaSession } from "../src/session";

function kvStub(initial: SupaSession) {
  let stored = JSON.stringify(initial);
  return {
    get: vi.fn(async () => stored),
    put: vi.fn(async (_k: string, v: string) => { stored = v; }),
    delete: vi.fn(async () => { stored = ""; }),
    _peek: () => (stored ? JSON.parse(stored) as SupaSession : null),
  };
}

describe("getValidJwt", () => {
  it("returns the stored token when not near expiry", async () => {
    const kv = kvStub({ access_token: "a", refresh_token: "r", expires_at: 10_000_000_000_000 });
    const jwt = await getValidJwt(kv as any, "grant1", vi.fn() as any, () => 1_000);
    expect(jwt).toBe("a");
  });

  it("refreshes and persists when within 60s of expiry", async () => {
    const now = 1_000_000;
    const kv = kvStub({ access_token: "old", refresh_token: "r-old", expires_at: now + 30_000 });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      access_token: "new", refresh_token: "r-new", expires_in: 3600,
    }), { status: 200 }));
    const jwt = await getValidJwt(kv as any, "grant1", fetchMock as any, () => now);
    expect(jwt).toBe("new");
    expect(kv._peek()!.access_token).toBe("new");
    expect(kv._peek()!.refresh_token).toBe("r-new");
  });

  it("throws and clears the binding when refresh fails", async () => {
    const now = 1_000_000;
    const kv = kvStub({ access_token: "old", refresh_token: "bad", expires_at: now });
    const fetchMock = vi.fn(async () => new Response("{}", { status: 400 }));
    await expect(getValidJwt(kv as any, "grant1", fetchMock as any, () => now))
      .rejects.toThrow(/re-?login/i);
    expect(kv.delete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/session.test.ts`
Expected: FAIL — cannot find `../src/session`.

- [ ] **Step 3: Write `src/session.ts`**

```ts
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

export interface SupaSession {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
}

const REFRESH_SKEW_MS = 60_000;
const key = (grant: string) => `supa:${grant}`;

export async function saveSession(kv: KVNamespace, grant: string, s: SupaSession) {
  await kv.put(key(grant), JSON.stringify(s));
}

export async function getValidJwt(
  kv: KVNamespace,
  grant: string,
  fetchImpl: typeof fetch,
  now: () => number = Date.now,
): Promise<string> {
  const raw = await kv.get(key(grant));
  if (!raw) throw new Error("No session — please re-login.");
  const s = JSON.parse(raw) as SupaSession;

  if (s.expires_at - now() > REFRESH_SKEW_MS) return s.access_token;

  const res = await fetchImpl(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !body.access_token) {
    await kv.delete(key(grant));
    throw new Error("Session expired — please re-login.");
  }
  const next: SupaSession = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: now() + body.expires_in * 1000,
  };
  await kv.put(key(grant), JSON.stringify(next));
  return next.access_token;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/session.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/session.ts test/session.test.ts && git commit -m "feat: kv session store with jwt refresh"
```

---

## Task 4: Embed SKILL.md at build time

**Files:**
- Create: `learn-mcp/skill/SKILL.md` (copied from plugin)
- Create: `learn-mcp/src/skill.ts`
- Create: `learn-mcp/scripts/sync-skill.sh`

- [ ] **Step 1: Write `scripts/sync-skill.sh`**

```bash
#!/bin/bash
# Copies the single source of truth (plugin SKILL.md) into the worker build.
set -euo pipefail
SRC="${1:-$HOME/.claude/plugins/manual/learn/skills/learn/SKILL.md}"
cp "$SRC" "$(dirname "$0")/../skill/SKILL.md"
echo "Synced SKILL.md from $SRC"
```
Run: `chmod +x scripts/sync-skill.sh && ./scripts/sync-skill.sh`
Expected: `skill/SKILL.md` exists and matches the plugin file.

- [ ] **Step 2: Write `src/skill.ts`**

```ts
// Bundled at build time so the worker ships the full teaching flow.
import skillMd from "../skill/SKILL.md";
export const SKILL_TEXT: string = skillMd as unknown as string;

export const SERVER_INSTRUCTIONS =
  "This connector is a personal adaptive learning tutor (spaced repetition + " +
  "5 teaching methods). To start or continue a study session, load the `learn` " +
  "prompt, or just say 'start my learn session'. Use the provided tools for all " +
  "data operations — never invent progress data.";
```

- [ ] **Step 3: Make `.md` importable as text**

Add to `wrangler.toml`:
```toml
[[rules]]
type = "Text"
globs = ["**/*.md"]
fallthrough = true
```
And to `tsconfig.json` `compilerOptions` add a module declaration file instead — create `learn-mcp/src/md.d.ts`:
```ts
declare module "*.md" {
  const content: string;
  export default content;
}
```

- [ ] **Step 4: Commit**

```bash
git add skill/SKILL.md src/skill.ts src/md.d.ts scripts/sync-skill.sh wrangler.toml
git commit -m "feat: embed SKILL.md as build-time text"
```

---

## Task 5: MCP agent — tools, prompt, instructions

**Files:**
- Create: `learn-mcp/src/mcp.ts`
- Test: `learn-mcp/test/mcp.test.ts`

The MCP agent reads the authenticated grant id from `this.props` (populated by the OAuth provider in Task 6), resolves a JWT via `getValidJwt`, and proxies each tool to `callRpc`. It registers the `learn` prompt (full `SKILL.md`) and one tool per `RPC_FUNCTIONS` entry.

- [ ] **Step 1: Write the failing test (tool registration + proxy)**

```ts
import { describe, it, expect, vi } from "vitest";
import { buildToolHandlers } from "../src/mcp";

describe("buildToolHandlers", () => {
  it("creates one handler per RPC function and proxies params through", async () => {
    const calls: any[] = [];
    const deps = {
      getJwt: vi.fn(async () => "jwt-x"),
      callRpc: vi.fn(async (_f: any, jwt: string, fn: string, params: any) => {
        calls.push({ jwt, fn, params }); return { fn, params };
      }),
      fetchImpl: vi.fn(),
    };
    const handlers = buildToolHandlers(deps as any, "grant-1");
    expect(Object.keys(handlers)).toContain("get_dashboard");
    expect(Object.keys(handlers)).toContain("add_touch");

    const out = await handlers["get_topic"]({ p_topic_id: "t1" });
    expect(calls[0]).toEqual({ jwt: "jwt-x", fn: "get_topic", params: { p_topic_id: "t1" } });
    expect(out).toEqual({ fn: "get_topic", params: { p_topic_id: "t1" } });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/mcp.test.ts`
Expected: FAIL — `buildToolHandlers` not exported.

- [ ] **Step 3: Write `src/mcp.ts`**

```ts
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RPC_FUNCTIONS, type RpcFunction } from "./config";
import { callRpc } from "./rpc";
import { getValidJwt } from "./session";
import { SKILL_TEXT, SERVER_INSTRUCTIONS } from "./skill";

// Extracted for unit testing without a live DO/transport.
export interface ToolDeps {
  getJwt: (grant: string) => Promise<string>;
  callRpc: typeof callRpc;
  fetchImpl: typeof fetch;
}

export function buildToolHandlers(deps: ToolDeps, grant: string) {
  const handlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {};
  for (const fn of RPC_FUNCTIONS) {
    handlers[fn] = async (params: Record<string, unknown>) => {
      const jwt = await deps.getJwt(grant);
      const hasParams = params && Object.keys(params).length > 0;
      return deps.callRpc(deps.fetchImpl, jwt, fn, hasParams ? params : undefined);
    };
  }
  return handlers;
}

// Props injected by the OAuth provider after a successful grant.
type Props = { grant: string };

export class LearnMcp extends McpAgent<Env, unknown, Props> {
  server = new McpServer(
    { name: "learn", version: "1.0.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );

  async init() {
    const grant = this.props.grant;
    const deps: ToolDeps = {
      getJwt: (g) => getValidJwt(this.env.OAUTH_KV, g, fetch),
      callRpc,
      fetchImpl: fetch,
    };
    const handlers = buildToolHandlers(deps, grant);

    this.server.prompt("learn", "Start or continue an adaptive learning session.", async () => ({
      messages: [{ role: "user", content: { type: "text", text: SKILL_TEXT } }],
    }));

    for (const fn of RPC_FUNCTIONS as readonly RpcFunction[]) {
      this.server.tool(
        fn,
        `learn: ${fn} — proxied Supabase RPC. Pass the p_* params documented in the learn prompt.`,
        { params: z.record(z.unknown()).optional() },
        async ({ params }) => {
          try {
            const data = await handlers[fn]((params as Record<string, unknown>) ?? {});
            return { content: [{ type: "text", text: JSON.stringify(data) }] };
          } catch (e) {
            return { isError: true, content: [{ type: "text", text: (e as Error).message }] };
          }
        },
      );
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/mcp.test.ts`
Expected: PASS. (Only `buildToolHandlers` is exercised; the DO class needs the workers runtime and is covered by the smoke test in Task 8.)

- [ ] **Step 5: Commit**

```bash
git add src/mcp.ts test/mcp.test.ts && git commit -m "feat: mcp agent with tools, learn prompt, instructions"
```

---

## Task 6: OAuth login handler — /authorize delegation + Supabase callback

**Files:**
- Create: `learn-mcp/src/login.ts`

The default handler serves two routes:
- `GET /authorize` → parse the MCP OAuth request, stash it in KV under a random `state`, redirect the browser to the dashboard with `?mcp_state=<state>`.
- `POST /supabase-callback` → validate `state`, save the Supabase session, complete the authorization, and return the Claude redirect URL as JSON for the dashboard to follow.

- [ ] **Step 1: Write `src/login.ts`**

```ts
import { saveSession, type SupaSession } from "./session";
import { DASHBOARD_URL } from "./config";

interface PendingAuth {
  // Opaque request object produced by parseAuthRequest, re-serialized.
  authRequest: unknown;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/authorize" && req.method === "GET") {
      const authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(req);
      const state = crypto.randomUUID();
      await env.OAUTH_KV.put(
        `pending:${state}`,
        JSON.stringify({ authRequest } satisfies PendingAuth),
        { expirationTtl: 600 },
      );
      const dest = new URL(DASHBOARD_URL);
      dest.searchParams.set("mcp_state", state);
      return Response.redirect(dest.toString(), 302);
    }

    if (url.pathname === "/supabase-callback" && req.method === "POST") {
      return handleCallback(req, env);
    }

    if (url.pathname === "/supabase-callback" && req.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }));
    }

    return new Response("Not found", { status: 404 });
  },
};

async function handleCallback(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => null)) as
    | (SupaSession & { state: string }) | null;
  if (!body?.state || !body.access_token || !body.refresh_token) {
    return cors(json({ error: "bad_request" }, 400));
  }
  const pendingRaw = await env.OAUTH_KV.get(`pending:${body.state}`);
  if (!pendingRaw) return cors(json({ error: "unknown_state" }, 400));
  await env.OAUTH_KV.delete(`pending:${body.state}`);
  const { authRequest } = JSON.parse(pendingRaw) as PendingAuth;

  // Grant id ties the MCP token to the stored Supabase session.
  const grant = crypto.randomUUID();
  const session: SupaSession = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: body.expires_at,
  };
  await saveSession(env.OAUTH_KV, grant, session);

  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: authRequest,
    userId: grant,
    scope: [],
    metadata: {},
    props: { grant },
  });

  return cors(json({ redirectTo }));
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json" },
  });
}
function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", DASHBOARD_URL.replace(/\/$/, ""));
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: passes once `Env` is declared in Task 7. If run now, expect an `Env` error — proceed to Task 7 then re-run.

- [ ] **Step 3: Commit**

```bash
git add src/login.ts && git commit -m "feat: oauth login handler delegating to dashboard"
```

---

## Task 7: Wire the Worker entry (OAuthProvider) + Env types

**Files:**
- Create: `learn-mcp/src/index.ts`
- Create: `learn-mcp/worker-configuration.d.ts`

- [ ] **Step 1: Write `worker-configuration.d.ts`**

```ts
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
declare global {
  interface Env {
    OAUTH_KV: KVNamespace;
    OAUTH_PROVIDER: OAuthHelpers;
    MCP_OBJECT: DurableObjectNamespace;
  }
}
export {};
```

- [ ] **Step 2: Write `src/index.ts`**

```ts
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import loginHandler from "./login";
import { LearnMcp } from "./mcp";

export { LearnMcp };

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: LearnMcp.mount("/mcp") as any,
  defaultHandler: loginHandler as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
```

- [ ] **Step 3: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Boot locally**

Run: `npx wrangler dev` (leave running in one shell)
Expected: serves on `http://localhost:8787`. `curl -s localhost:8787/authorize` (no params) returns an OAuth error JSON, not a crash.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts worker-configuration.d.ts && git commit -m "feat: wire oauth provider + mcp mount"
```

---

## Task 8: Deploy + MCP smoke test with Inspector

**Files:** none (deploy + manual verify)

- [ ] **Step 1: Deploy**

Run: `npx wrangler deploy`
Expected: prints `https://learn-mcp.<subdomain>.workers.dev`. Record this URL.

- [ ] **Step 2: List tools/prompts via MCP Inspector**

Run: `npx @modelcontextprotocol/inspector`
In the UI, connect to `https://learn-mcp.<subdomain>.workers.dev/mcp` (streamable HTTP). Complete the OAuth flow (it will bounce you to the dashboard — log in with a test Supabase user; requires Task 9 dashboard change deployed first, so do Task 9 before this step if the flow stalls at the callback).
Expected: `tools/list` shows all 13 RPC tools; `prompts/list` shows `learn`; `prompts/get learn` returns the full SKILL.md text; calling `get_dashboard` returns real JSON for that user.

- [ ] **Step 3: Commit deployment notes**

```bash
git commit --allow-empty -m "chore: first deploy of learn-mcp"
```

---

## Task 9: Dashboard — callback POST + install card

**Files:**
- Modify: `~/Desktop/else/learn-dashboard/src/hooks/useAuth.ts`
- Create: `~/Desktop/else/learn-dashboard/src/lib/mcpCallback.ts`
- Modify: `~/Desktop/else/learn-dashboard/src/App.tsx` (render install card)

- [ ] **Step 1: Write `src/lib/mcpCallback.ts`**

```ts
import type { Session } from "@supabase/supabase-js";

const MCP_WORKER_URL = "https://learn-mcp.<subdomain>.workers.dev"; // set to Task 8 URL

// If we arrived here from a Claude OAuth authorize, finish the handshake.
export async function completeMcpAuthIfPending(session: Session): Promise<boolean> {
  const state = new URLSearchParams(window.location.search).get("mcp_state");
  if (!state) return false;
  const res = await fetch(`${MCP_WORKER_URL}/supabase-callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      state,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at:
        (session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in) * 1000,
    }),
  });
  if (!res.ok) throw new Error("MCP auth callback failed");
  const { redirectTo } = (await res.json()) as { redirectTo: string };
  window.location.href = redirectTo; // hand control back to Claude
  return true;
}
```

- [ ] **Step 2: Call it on login in `useAuth.ts`**

Replace the `notifyCli(s)` call inside `onAuthStateChange` with:
```ts
import { completeMcpAuthIfPending } from "../lib/mcpCallback";
// ...
const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
  setSession(s);
  if (s) completeMcpAuthIfPending(s).catch(() => {});
});
```
(Leave the old `notifyCli`/localhost path until the plugin cutover in Task 10, then delete it.)

- [ ] **Step 3: Add an "Add to Claude Desktop" card**

In `App.tsx`, render a small card with the connector URL and steps:
```tsx
<div className="rounded-lg border p-4">
  <h3 className="font-semibold">Add to Claude Desktop</h3>
  <ol className="list-decimal ml-5 text-sm">
    <li>Settings → Connectors → Add custom connector</li>
    <li>Paste: <code>https://learn-mcp.&lt;subdomain&gt;.workers.dev/mcp</code></li>
    <li>Click Add, then log in here once.</li>
  </ol>
  <p className="text-xs opacity-70">Requires a paid Claude plan (Pro/Max/Team).</p>
</div>
```

- [ ] **Step 4: Build + deploy dashboard**

Run: `cd ~/Desktop/else/learn-dashboard && npm run build && <existing deploy step>`
Expected: build passes; GitHub Pages updated.

- [ ] **Step 5: End-to-end auth test**

Add the connector in Claude Desktop → browser opens dashboard → log in → redirected back → connector shows Connected. Then run Task 8 Step 2 verification against the live connector.

- [ ] **Step 6: Commit (dashboard repo)**

```bash
cd ~/Desktop/else/learn-dashboard
git add src/lib/mcpCallback.ts src/hooks/useAuth.ts src/App.tsx
git commit -m "feat: complete MCP OAuth callback + install card"
```

---

## Task 10: Plugin cutover — declare MCP, update SKILL.md, delete scripts

**Files:**
- Modify: `.claude-plugin/plugin.json` (or add `.mcp.json`)
- Modify: `skills/learn/SKILL.md`
- Delete: `scripts/api.sh`, `scripts/auth.js`
- Modify: `skills/learn-dashboard/SKILL.md`

- [ ] **Step 1: Declare the remote MCP in the plugin**

Create `.mcp.json` at the plugin root:
```json
{
  "mcpServers": {
    "learn": {
      "type": "http",
      "url": "https://learn-mcp.<subdomain>.workers.dev/mcp"
    }
  }
}
```
(Confirm the plugin loader picks up `.mcp.json`; if it requires the key inside `plugin.json`, move `mcpServers` there instead.)

- [ ] **Step 2: Rewrite the API Access section of `SKILL.md`**

Replace the `~/.claude/.../api.sh` wrapper instructions with MCP-tool usage. New section text:
```markdown
## API Access

All data operations go through the `learn` MCP connector's tools — one tool per
operation (`get_dashboard`, `get_subject_context`, `get_topic`, `create_session`,
`add_touch`, `update_topic`, `update_methods`, `end_session`, `create_subject`,
`add_topic`, `update_subject`, `delete_subject`, `get_schema`). Call the tool with
the documented `p_*` params as its `params` object. Never read or write local
files, and never use curl.

If the connector isn't present, tell the user to install it: `claude plugin
install learn` (Claude Code) or add the connector URL in Settings → Connectors
(Desktop). The first call triggers a one-time browser login.
```
Then, throughout the file, replace each `~/.claude/plugins/manual/learn/scripts/api.sh "<msg>" "<fn>" "$DATA"` example with the equivalent tool call, e.g.:
```
Call tool `get_subject_context` with params { "p_subject_id": "<id>" }.
```
Keep every teaching section (decision tree, methods, scoring) byte-for-byte — only the transport lines change.

- [ ] **Step 3: Update the dashboard skill**

`skills/learn-dashboard/SKILL.md` currently runs `open <url>`. That's fine for Claude Code; leave it. (No change required; note it here for completeness.)

- [ ] **Step 4: Delete the local scripts**

Run:
```bash
git rm scripts/api.sh scripts/auth.js
```

- [ ] **Step 5: Re-sync the embedded skill and redeploy the Worker**

Run:
```bash
cd ../learn-mcp && ./scripts/sync-skill.sh && npx wrangler deploy
```
Expected: Worker's `learn` prompt now serves the MCP-tool version of SKILL.md.

- [ ] **Step 6: Regression test in Claude Code**

Reinstall/reload the plugin, run `/learn`. Expected: connector auto-registers, OAuth runs once, a full session works end-to-end with no `api.sh` present.

- [ ] **Step 7: Remove the dead localhost path in the dashboard**

In `~/Desktop/else/learn-dashboard/src/hooks/useAuth.ts`, delete the old `notifyCli` function and its call. Rebuild + deploy.

- [ ] **Step 8: Commit (plugin repo)**

```bash
git add -A && git commit -m "feat: converge learn onto remote MCP; remove local scripts"
```

---

## Self-review notes

- **Spec coverage:** hosting (T1), auth proxy + callback (T6/T9), RPC proxy (T2), session/JWT refresh (T3), MCP tools+prompt+instructions (T4/T5), single source of truth via sync-skill (T4/T10), install one-step per platform (T9 card + T10 `.mcp.json`), delete scripts (T10). All spec sections mapped.
- **Type consistency:** `SupaSession`, `getValidJwt`, `saveSession`, `callRpc`, `buildToolHandlers`, `grant` prop name used consistently across T2/T3/T5/T6.
- **Known verification points** (library API shapes to confirm against installed versions during T5–T7): `McpAgent.mount`, `server.prompt`/`server.tool` signatures, `OAuthProvider` option names, `parseAuthRequest`/`completeAuthorization` return shapes. These are the only steps whose exact API may differ by version; the flow and data contracts are fixed.
```
