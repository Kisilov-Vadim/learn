import type { Session } from '@supabase/supabase-js'

const MCP_WORKER_URL = 'https://learn-mcp.djvadya16.workers.dev'

// If this page load is part of a Claude MCP OAuth authorize flow, the Worker's
// /authorize redirected the browser here with ?mcp_state=<uuid>.
export function getMcpState(): string | null {
  return new URLSearchParams(window.location.search).get('mcp_state')
}

// Hands the Supabase session to the Worker to finish the MCP OAuth handshake.
// Resolves with the redirectTo URL on success — caller decides when/whether to navigate.
export async function postMcpCallback(session: Session): Promise<string> {
  const state = getMcpState()
  const expires_at =
    (session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in) * 1000

  let res: Response
  try {
    res = await fetch(`${MCP_WORKER_URL}/supabase-callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at,
      }),
    })
  } catch {
    throw new Error("Couldn't connect — please try again.")
  }

  if (!res.ok) {
    let message = "Couldn't connect — please try again."
    try {
      const body = (await res.json()) as { error?: string }
      if (body?.error) message = body.error
    } catch {
      // ignore — keep generic message
    }
    throw new Error(message)
  }

  const { redirectTo } = (await res.json()) as { redirectTo: string }
  return redirectTo
}
