import type { Session } from '@supabase/supabase-js'

const MCP_WORKER_URL = 'https://learn-mcp.djvadya16.workers.dev'

// If this page load is part of a Claude MCP OAuth authorize (?mcp_state=...),
// finish the handshake by handing the Supabase session to the Worker.
export async function completeMcpAuthIfPending(session: Session): Promise<boolean> {
  const state = new URLSearchParams(window.location.search).get('mcp_state')
  if (!state) return false
  const expires_at =
    (session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in) * 1000
  const res = await fetch(`${MCP_WORKER_URL}/supabase-callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at,
    }),
  })
  if (!res.ok) throw new Error('MCP auth callback failed')
  const { redirectTo } = (await res.json()) as { redirectTo: string }
  window.location.href = redirectTo
  return true
}
