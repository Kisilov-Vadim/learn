import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Login } from './Login'
import { postMcpCallback } from '../lib/mcpCallback'

interface Props {
  session: Session | null
  login: (email: string, password: string) => Promise<void>
}

type Status = 'idle' | 'connecting' | 'success' | 'error'

export function ConnectScreen({ session, login }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [err, setErr] = useState('')

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-full max-w-sm">
          <div className="text-accent text-2xl font-bold mb-8 text-center tracking-tight">Learn</div>
          <div className="bg-surface rounded-xl p-6 border border-border flex flex-col gap-3 mb-4">
            <div className="text-white text-lg font-semibold">Connect Learn to your app</div>
            <div className="text-muted text-sm">Log in to authorize the connection.</div>
          </div>
          <Login onLogin={login} />
        </div>
      </div>
    )
  }

  const activeSession = session

  async function handleConnect() {
    setStatus('connecting')
    setErr('')
    try {
      const redirectTo = await postMcpCallback(activeSession)
      setStatus('success')
      // Navigating to redirectTo is what delivers the OAuth code back to the
      // client and completes the connection — do NOT window.close() before this
      // (a script-closable tab would abort delivery → Claude shows "didn't finish").
      window.location.href = redirectTo
    } catch (e) {
      setErr((e as Error).message)
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="w-full max-w-sm">
        <div className="text-accent text-2xl font-bold mb-8 text-center tracking-tight">Learn</div>
        <div className="bg-surface rounded-xl p-6 border border-border flex flex-col gap-4">
          <div className="text-white text-lg font-semibold">Connect Learn</div>
          <div className="text-muted text-sm">Authorize this device to start learning in your AI app.</div>

          {status === 'error' && (
            <div className="border border-border2 bg-surface2 rounded-lg p-3 text-white text-sm">
              ⚠ {err}
            </div>
          )}

          {status === 'success' ? (
            <div className="text-muted text-sm">✓ Connected — returning to your app…</div>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={status === 'connecting'}
              className="bg-accent2 hover:bg-purple-600 text-white font-semibold rounded-lg py-2.5 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {status === 'connecting' ? (
                <span className="flex items-center gap-1">
                  Connecting
                  <span className="inline-flex gap-0.5">
                    <span className="animate-bounce [animation-delay:-0.3s]">.</span>
                    <span className="animate-bounce [animation-delay:-0.15s]">.</span>
                    <span className="animate-bounce">.</span>
                  </span>
                </span>
              ) : status === 'error' ? (
                'Try again'
              ) : (
                'Connect'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
