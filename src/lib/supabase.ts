// Supabase client — null when env isn't configured, and every caller
// treats null as "offline-only mode" so the app never requires it.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null

export function cloudEnabled(): boolean {
  return supabase !== null
}
