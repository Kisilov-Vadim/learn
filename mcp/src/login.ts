import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import { saveSession, type SupaSession } from "./session";
import { DASHBOARD_URL } from "./config";

interface PendingAuth {
  authRequest: AuthRequest; // AuthRequest is a plain JSON-serializable object
}

/** Shape the dashboard POSTs back to /supabase-callback. */
export interface CallbackBody extends SupaSession {
  state: string;
}

/**
 * Pure validation of the /supabase-callback body. Returns the normalized
 * payload when valid, or null when the body is missing required fields.
 */
export function validateCallbackBody(body: unknown): CallbackBody | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (
    typeof b.state !== "string" || !b.state ||
    typeof b.access_token !== "string" || !b.access_token ||
    typeof b.refresh_token !== "string" || !b.refresh_token ||
    typeof b.expires_at !== "number"
  ) {
    return null;
  }
  return {
    state: b.state,
    access_token: b.access_token,
    refresh_token: b.refresh_token,
    expires_at: b.expires_at,
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/authorize" && req.method === "GET") {
      let authRequest: AuthRequest;
      try {
        authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(req);
      } catch {
        // Malformed request or unregistered client_id — clean 400, not a 500.
        return json({ error: "invalid_request" }, 400);
      }
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
  const raw = await req.json().catch(() => null);
  const body = validateCallbackBody(raw);
  if (!body) return cors(json({ error: "bad_request" }, 400));

  const pendingRaw = await env.OAUTH_KV.get(`pending:${body.state}`);
  if (!pendingRaw) return cors(json({ error: "unknown_state" }, 400));
  await env.OAUTH_KV.delete(`pending:${body.state}`); // one-time use
  const { authRequest } = JSON.parse(pendingRaw) as PendingAuth;

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
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function cors(res: Response): Response {
  // Allow-Origin must be scheme+host only (no path), or the browser rejects the
  // preflight and never sends the POST. DASHBOARD_URL has a /learn-dashboard path.
  res.headers.set("Access-Control-Allow-Origin", new URL(DASHBOARD_URL).origin);
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}
