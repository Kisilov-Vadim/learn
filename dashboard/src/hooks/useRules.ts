import { useCallback, useEffect, useState } from 'react'
import { rpc } from '../lib/supabase'
import type { Rule } from '../types'

// subjectId === null → global rules; otherwise that subject's rules.
export function useRules(subjectId: string | null) {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true); setError(null)
    const params = subjectId
      ? { p_action: 'list', p_subject_id: subjectId }
      : { p_action: 'list', p_scope: 'global' }
    rpc<{ global?: Rule[]; rules?: Rule[] }>('manage_rules', params)
      .then(data => setRules(subjectId ? (data?.rules ?? []) : (data?.global ?? [])))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [subjectId])

  useEffect(() => { load() }, [load])

  const add = useCallback(async (label: string, text: string, active = true) => {
    await rpc('manage_rules', {
      p_action: 'add',
      p_label: label,
      p_text: text,
      p_active: active,
      ...(subjectId ? { p_subject_id: subjectId } : {}),
    })
    load()
  }, [subjectId, load])

  const update = useCallback(async (id: string, patch: { label?: string; text?: string; active?: boolean }) => {
    await rpc('manage_rules', {
      p_action: 'update',
      p_rule_id: id,
      ...(patch.label !== undefined ? { p_label: patch.label } : {}),
      ...(patch.text !== undefined ? { p_text: patch.text } : {}),
      ...(patch.active !== undefined ? { p_active: patch.active } : {}),
    })
    load()
  }, [load])

  const remove = useCallback(async (id: string) => {
    await rpc('manage_rules', { p_action: 'delete', p_rule_id: id })
    load()
  }, [load])

  return { rules, loading, error, add, update, remove, reload: load }
}
