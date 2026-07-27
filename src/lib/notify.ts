// Fire-and-forget email pings. Failure is always acceptable — the action
// (follow, accept, comment) already succeeded; the email is a courtesy.
import { supabase } from './supabase'

export type NotifyKind = 'follow_request' | 'follow_accept' | 'comment'

export async function notify(payload: {
  kind: NotifyKind
  targetUserId?: string
  dreamId?: string
  mutual?: boolean
}): Promise<void> {
  try {
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return
    void fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    }).catch(() => {})
  } catch {
    // never let a courtesy email break the action it decorates
  }
}
