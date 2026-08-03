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
