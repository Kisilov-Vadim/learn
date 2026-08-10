import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

export interface SupaSession {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
}

const REFRESH_SKEW_MS = 60_000;
const key = (grant: string) => `supa:${grant}`;

// Single-flight refreshes per grant within this isolate. Supabase rotates the
// refresh token on every refresh; a second concurrent refresh would present an
// already-rotated token, which reuse-detection treats as theft and revokes the
// whole session — forcing a full re-login. Collapsing concurrent refreshes into
// one network call removes that race (the common trigger: a turn firing several
// RPC tools at once after the JWT has expired).
const inflight = new Map<string, Promise<string>>();

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

  let p = inflight.get(grant);
  if (!p) {
    p = refreshSession(kv, grant, fetchImpl, now).finally(() => inflight.delete(grant));
    inflight.set(grant, p);
  }
  return p;
}

async function refreshSession(
  kv: KVNamespace,
  grant: string,
  fetchImpl: typeof fetch,
  now: () => number,
): Promise<string> {
  // Re-read: a refresh may have completed while we queued behind single-flight.
  const raw = await kv.get(key(grant));
  if (!raw) throw new Error("No session — please re-login.");
  const s = JSON.parse(raw) as SupaSession;
  if (s.expires_at - now() > REFRESH_SKEW_MS) return s.access_token;

  // Retry transient failures (network error or 5xx) once. NEVER delete the
  // session on a transient failure — one Supabase blip must not log the user out.
  let res: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetchImpl(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
    } catch {
      res = undefined; // network error — transient
    }
    if (res && res.status < 500) break; // definitive response (2xx/4xx)
  }

  if (!res || res.status >= 500) {
    // Transient: auth service unreachable / erroring. Keep the session intact.
    throw new Error("Auth service temporarily unavailable — please retry.");
  }

  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !body.access_token) {
    // Definitive rejection (400/401 invalid_grant, revoked, etc.) — session is dead.
    await kv.delete(key(grant));
    throw new Error("Session expired — please re-login.");
  }

  const next: SupaSession = {
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? s.refresh_token,
    expires_at: now() + body.expires_in * 1000,
  };
  await kv.put(key(grant), JSON.stringify(next));
  return next.access_token;
}
