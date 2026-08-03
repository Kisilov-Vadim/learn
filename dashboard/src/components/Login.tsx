import { useState } from 'react'

interface Props {
  onLogin: (email: string, password: string) => Promise<void>
}

export function Login({ onLogin }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onLogin(email, password)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="text-accent text-2xl font-bold mb-8 text-center tracking-tight">Learn</div>
        <div className="bg-surface rounded-xl p-6 border border-border flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="bg-bg border border-border2 rounded-lg text-[15px] px-4 py-2.5 outline-none text-white placeholder:text-faint focus:border-accent transition-colors"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="bg-bg border border-border2 rounded-lg text-[15px] px-4 py-2.5 outline-none text-white placeholder:text-faint focus:border-accent transition-colors"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-accent2 hover:bg-purple-600 text-white font-semibold rounded-lg py-2.5 transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  )
}
