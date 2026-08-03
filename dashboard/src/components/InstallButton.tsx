import { useEffect, useState } from 'react'
import { CommandBlock } from './CommandBlock'

const MCP_URL = 'https://learn-mcp.djvadya16.workers.dev/mcp'

type Tab = 'app' | 'code'

const TABS: { id: Tab; label: string }[] = [
  { id: 'app', label: 'Claude Desktop / Mobile / Web' },
  { id: 'code', label: 'Claude Code / other agents' },
]

export function InstallButton() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('app')

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-medium px-3 py-1.5 rounded-md border border-border2 text-muted hover:text-white hover:border-accent transition-colors"
      >
        Connect
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-surface border border-border rounded-xl p-7 flex flex-col gap-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start">
              <h2 className="text-white font-bold text-xl tracking-tight">Connect Learn</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-dim hover:text-white text-2xl leading-none transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <p className="text-muted text-sm leading-relaxed">
              This site is just a dashboard to monitor your progress. The learning itself happens
              inside your AI agent. Learn is a standard remote{' '}
              <span className="text-white font-medium">MCP connector</span> — add it to any
              MCP-capable agent, then start a session by saying{' '}
              <span className="text-accent">"start my learn session"</span> (or running the{' '}
              <span className="text-accent font-mono">learn</span> prompt).
            </p>

            <nav role="tablist" className="flex border-b border-border -mb-1">
              {TABS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    tab === t.id
                      ? 'text-accent border-accent'
                      : 'text-dim border-transparent hover:text-muted'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {tab === 'app' && (
              <div role="tabpanel" className="flex flex-col gap-3">
                <h3 className="text-white font-semibold text-base tracking-tight">
                  Add as a custom connector
                </h3>
                <ol className="text-muted text-sm leading-relaxed list-decimal list-inside flex flex-col gap-1">
                  <li>Settings → Connectors → Add custom connector</li>
                  <li>Paste the connector URL below</li>
                  <li>Click Add, then log in on this dashboard once</li>
                </ol>
                <CommandBlock command={MCP_URL} prefix="" />
                <p className="text-faint text-xs">
                  On mobile you can't add connectors in the app — add it once at{' '}
                  <span className="text-dim">claude.ai</span> in a browser and it appears in the
                  mobile app. Requires a paid Claude plan (Pro/Max/Team); some Enterprise orgs
                  restrict custom connectors — ask your admin if the option is missing.
                </p>
              </div>
            )}

            {tab === 'code' && (
              <div role="tabpanel" className="flex flex-col gap-3">
                <h3 className="text-white font-semibold text-base tracking-tight">
                  Connect from Claude Code or any MCP client
                </h3>
                <div className="flex flex-col gap-2">
                  <p className="text-dim text-xs">Claude Code — run in your terminal:</p>
                  <CommandBlock command="claude mcp add --transport http learn https://learn-mcp.djvadya16.workers.dev/mcp" />
                </div>
                <p className="text-muted text-sm leading-relaxed">
                  Any other MCP-capable agent: add a <span className="text-white">remote / HTTP</span>{' '}
                  MCP server pointing at the endpoint below. It uses OAuth — a browser login opens on
                  first connect.
                </p>
                <CommandBlock command={MCP_URL} prefix="" />
                <p className="text-faint text-xs">
                  Then run <span className="text-dim">/mcp</span> to authenticate, and say{' '}
                  <span className="text-dim">"start my learn session"</span>.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
