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
