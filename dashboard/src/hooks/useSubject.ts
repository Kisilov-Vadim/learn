import { useEffect, useState } from 'react'
import { rpc } from '../lib/supabase'
import type { Topic, Touch, SubjectContext } from '../types'

export function useTopics(subjectId: string | null) {
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!subjectId) return
    setLoading(true)
    rpc<{ topics: Topic[] }>('query_topics', { p_subject_id: subjectId, p_limit: 500 })
      .then(data => setTopics(data?.topics ?? []))
      .finally(() => setLoading(false))
  }, [subjectId])

  return { topics, loading }
}

export function useTouches(subjectId: string | null) {
  const [touches, setTouches] = useState<Touch[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!subjectId) return
    setLoading(true)
    rpc<{ touches: Touch[] }>('query_touches', {
      p_subject_id: subjectId,
      p_sort_field: 'createdAt',
      p_sort_dir: 'desc',
      p_limit: 1000,
    })
      .then(data => setTouches(data?.touches ?? []))
      .finally(() => setLoading(false))
  }, [subjectId])

  return { touches, loading }
}

export function useSubjectContext(subjectId: string | null) {
  const [context, setContext] = useState<SubjectContext | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!subjectId) return
    setLoading(true)
    rpc<SubjectContext>('get_subject_context', { p_subject_id: subjectId })
      .then(data => setContext(data))
      .finally(() => setLoading(false))
  }, [subjectId])

  return { context, loading }
}

export function useTopic(topicId: string | null) {
  const [topic, setTopic] = useState<Topic & { history: Touch[] } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!topicId) { setTopic(null); return }
    setLoading(true)

    rpc<Topic>('get_topic', { p_topic_id: topicId })
      .then(async topicData => {
        if (!topicData) return
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
      .finally(() => setLoading(false))
  }, [topicId])

  return { topic, loading }
}
