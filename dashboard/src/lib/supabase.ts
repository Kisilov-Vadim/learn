import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://wmbtdzlcqgdfqdxvaqeb.supabase.co'
const ANON_KEY = 'sb_publishable_soBWDz8wvsusMhEdVLm-LA_gp6IQWhK'

export const supabase = createClient(SUPABASE_URL, ANON_KEY)

export async function rpc<T>(fn: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, params)
  if (error) throw error
  return data as T
}
