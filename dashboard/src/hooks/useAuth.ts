import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { completeMcpAuthIfPending } from '../lib/mcpCallback'

function notifyCli(session: Session) {
  fetch('http://localhost:3333/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: (session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in) * 1000,
    }),
  }).catch(() => {})
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
      if (data.session) completeMcpAuthIfPending(data.session).catch(() => {})
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s)
      if (s) {
        notifyCli(s)
        completeMcpAuthIfPending(s).catch(() => {})
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  return { session, loading, login, logout }
}
