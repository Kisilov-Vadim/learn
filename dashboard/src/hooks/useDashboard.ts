import { useEffect, useState } from 'react'
import { rpc } from '../lib/supabase'
import type { Subject } from '../types'

export function useDashboard(enabled: boolean) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(false)
  // Distinguishes "not fetched yet" from "fetched, result is empty". Routing guards
  // depend on this: without it, the first render after login sees an empty `subjects`
  // and wrongly treats a valid subject URL as unknown.
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      setLoading(true)
      const data = await rpc<{ subjects: Subject[] }>('get_dashboard')
      setSubjects(data?.subjects ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }

  useEffect(() => {
    if (!enabled) return
    load()
  }, [enabled])

  return { subjects, loading, loaded, error, reload: load }
}
