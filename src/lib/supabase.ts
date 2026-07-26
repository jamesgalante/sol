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

// Client-side mirror of the server's LLM_ALLOWED_EMAILS (in api/sky-reading.ts).
// UX only — the serverless function is authoritative and re-checks the allowlist;
// this just decides whether to attempt the LLM path. Keep in sync with the Vercel
// LLM_ALLOWED_EMAILS env var.
const LLM_ALLOWED_EMAILS = ['solomon.barth@gmail.com', 'jgalante@stanford.edu']

export function llmEnabled(email: string | null | undefined): boolean {
  return Boolean(email) && LLM_ALLOWED_EMAILS.includes(email!.toLowerCase())
}
