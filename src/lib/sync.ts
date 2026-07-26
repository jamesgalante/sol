// Cloud layer for Circle. Local IndexedDB stays the source of truth for
// your own dreams; the cloud mirrors them (private by default) and serves
// the feed of dreams your followees chose to share.
import { supabase } from './supabase'
import type { Dream, Mood } from './types'
import { dreamMood } from './categorize'

export interface Profile {
  id: string
  username: string
  display_name?: string | null
  bio?: string | null
  cloud?: { color?: string } | null
  unlocks?: string[] | null
}

export interface FeedDream {
  id: string
  username: string
  title: string
  createdAt: number
  tags: string[]
  mood: Mood
  transcript: string
}

export interface FriendStats {
  total: number
  dark_pct: number
  last_week: number
  top_tag: string | null
}

function toRow(d: Dream, userId: string) {
  return {
    id: d.id,
    user_id: userId,
    created_at: new Date(d.createdAt).toISOString(),
    duration_sec: d.durationSec,
    transcript: d.transcript,
    title: d.title,
    tags: d.tags,
    mood: dreamMood(d),
    shared: d.shared ?? false,
    pinned: d.pinned ?? false,
  }
}

export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

const PROFILE_COLS = 'id, username, display_name, bio, cloud, unlocks'

export async function myProfile(): Promise<Profile | null> {
  if (!supabase) return null
  const uid = await currentUserId()
  if (!uid) return null
  const { data } = await supabase.from('profiles').select(PROFILE_COLS).eq('id', uid).maybeSingle()
  return data
}

export async function profileByUsername(username: string): Promise<Profile | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('username', username)
    .maybeSingle()
  return data
}

export async function updateProfile(fields: {
  display_name?: string | null
  bio?: string | null
  cloud?: { color?: string }
  unlocks?: string[]
}): Promise<{ error?: string }> {
  if (!supabase) return { error: 'offline' }
  const uid = await currentUserId()
  if (!uid) return { error: 'not signed in' }
  const { error } = await supabase.from('profiles').update(fields).eq('id', uid)
  if (error) {
    if (error.code === '23514') return { error: 'Too long — 40 chars for name, 200 for bio.' }
    return { error: error.message }
  }
  return {}
}

/** Dreams a user chose to display on their profile (RLS: pinned only,
 *  unless it's your own profile — then you see all pinned regardless). */
export async function pinnedDreams(userId: string): Promise<FeedDream[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('dreams')
    .select('id, title, created_at, tags, mood, transcript, profiles!dreams_user_id_fkey(username)')
    .eq('user_id', userId)
    .eq('pinned', true)
    .order('created_at', { ascending: false })
    .limit(20)
  return (data ?? []).map((r: any) => ({
    id: r.id,
    username: r.profiles?.username ?? '?',
    title: r.title,
    createdAt: new Date(r.created_at).getTime(),
    tags: r.tags ?? [],
    mood: (r.mood ?? 'neutral') as Mood,
    transcript: r.transcript,
  }))
}

export async function isFollowing(userId: string): Promise<boolean> {
  if (!supabase) return false
  const uid = await currentUserId()
  if (!uid) return false
  const { data } = await supabase
    .from('follows')
    .select('followee')
    .eq('follower', uid)
    .eq('followee', userId)
    .maybeSingle()
  return Boolean(data)
}

export async function claimUsername(username: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'offline' }
  const uid = await currentUserId()
  if (!uid) return { error: 'not signed in' }
  const { error } = await supabase.from('profiles').insert({ id: uid, username })
  if (error) {
    if (error.code === '23505') return { error: 'That name is taken.' }
    if (error.code === '23514') return { error: '3–20 chars: lowercase letters, numbers, _' }
    return { error: error.message }
  }
  return {}
}

/** Mirror one dream to the cloud (no-op offline / signed out). */
export async function pushDream(d: Dream): Promise<void> {
  if (!supabase) return
  const uid = await currentUserId()
  if (!uid) return
  await supabase.from('dreams').upsert(toRow(d, uid))
}

/** Push everything local — used once after sign-in. */
export async function pushAll(dreams: Dream[]): Promise<void> {
  if (!supabase || dreams.length === 0) return
  const uid = await currentUserId()
  if (!uid) return
  await supabase.from('dreams').upsert(dreams.map((d) => toRow(d, uid)))
}

export async function deleteCloudDream(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('dreams').delete().eq('id', id)
}

export async function follow(username: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'offline' }
  const uid = await currentUserId()
  if (!uid) return { error: 'not signed in' }
  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()
  if (!target) return { error: `No one named @${username} yet.` }
  if (target.id === uid) return { error: 'That one you already follow, forever.' }
  const { error } = await supabase.from('follows').insert({ follower: uid, followee: target.id })
  if (error && error.code !== '23505') return { error: error.message }
  return {}
}

export async function unfollow(followeeId: string): Promise<void> {
  if (!supabase) return
  const uid = await currentUserId()
  if (!uid) return
  await supabase.from('follows').delete().eq('follower', uid).eq('followee', followeeId)
}

export async function following(): Promise<Profile[]> {
  if (!supabase) return []
  const uid = await currentUserId()
  if (!uid) return []
  const { data } = await supabase
    .from('follows')
    .select('followee, profiles!follows_followee_fkey(id, username)')
    .eq('follower', uid)
  return (data ?? [])
    .map((r: any) => r.profiles)
    .filter(Boolean)
    .map((p: any) => ({ id: p.id, username: p.username }))
}

export async function feed(): Promise<FeedDream[]> {
  if (!supabase) return []
  const uid = await currentUserId()
  if (!uid) return []
  // Scope to followees explicitly — RLS also lets us read PINNED dreams
  // from anyone (profile shelves), and those must not leak into the feed.
  const followeeIds = (await following()).map((f) => f.id)
  if (followeeIds.length === 0) return []
  const { data } = await supabase
    .from('dreams')
    .select('id, title, created_at, tags, mood, transcript, profiles!dreams_user_id_fkey(username)')
    .in('user_id', followeeIds)
    .eq('shared', true)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data ?? []).map((r: any) => ({
    id: r.id,
    username: r.profiles?.username ?? '?',
    title: r.title,
    createdAt: new Date(r.created_at).getTime(),
    tags: r.tags ?? [],
    mood: (r.mood ?? 'neutral') as Mood,
    transcript: r.transcript,
  }))
}

export async function friendStats(userId: string): Promise<FriendStats | null> {
  if (!supabase) return null
  const { data } = await supabase.rpc('friend_stats', { target: userId })
  return data
}
