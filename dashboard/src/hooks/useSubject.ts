import { useCallback, useEffect, useState } from 'react'
import { rpc } from '../lib/supabase'
import type { Topic, Touch, SubjectContext, Session } from '../types'

export function useTopics(subjectId: string | null) {
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!subjectId) { setTopics([]); return }
    setLoading(true); setError(null)
    rpc<{ topics: Topic[] }>('query_topics', { p_subject_id: subjectId, p_limit: 500 })
      .then(data => setTopics(data?.topics ?? []))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [subjectId])

  useEffect(() => { load() }, [load])
  return { topics, loading, error, reload: load }
}

export function useTouches(subjectId: string | null) {
  const [touches, setTouches] = useState<Touch[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!subjectId) { setTouches([]); return }
    setLoading(true); setError(null)
    rpc<{ touches: Touch[] }>('query_touches', {
      p_subject_id: subjectId,
      p_sort_field: 'createdAt',
      p_sort_dir: 'desc',
      p_limit: 1000,
    })
      .then(data => setTouches(data?.touches ?? []))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [subjectId])

  useEffect(() => { load() }, [load])
  return { touches, loading, error, reload: load }
}

export function useSubjectContext(subjectId: string | null) {
  const [context, setContext] = useState<SubjectContext | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!subjectId) { setContext(null); return }
    setLoading(true); setError(null)
    rpc<SubjectContext>('get_subject_context', { p_subject_id: subjectId })
      .then(data => setContext(data))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [subjectId])

  useEffect(() => { load() }, [load])
  return { context, loading, error, reload: load }
}

export function useTopic(topicId: string | null) {
  const [topic, setTopic] = useState<(Topic & { history: Touch[] }) | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!topicId) { setTopic(null); return }
    setLoading(true); setError(null)
    rpc<Topic>('get_topic', { p_topic_id: topicId })
      .then(async topicData => {
        if (!topicData) { setTopic(null); return }
        // get_topic doesn't include history — fetch touches for this topic separately
        const touchData = await rpc<{ touches: Touch[] }>('query_touches', {
          p_subject_id: topicData.subjectId,
          p_filters: { topicId },
          p_sort_field: 'createdAt',
          p_sort_dir: 'desc',
          p_limit: 100,
        })
        setTopic({ ...topicData, history: touchData?.touches ?? [] })
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [topicId])

  useEffect(() => { load() }, [load])
  return { topic, loading, error, reload: load }
}

export function useSessions(subjectId: string | null) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!subjectId) { setSessions([]); return }
    setLoading(true); setError(null)
    rpc<{ sessions: Session[] }>('query_sessions', { p_subject_id: subjectId, p_limit: 1000 })
      .then(data => setSessions(data?.sessions ?? []))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [subjectId])

  useEffect(() => { load() }, [load])
  return { sessions, loading, error, reload: load }
}
