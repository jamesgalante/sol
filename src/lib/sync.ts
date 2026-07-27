// Cloud layer for Circle. Local IndexedDB stays the source of truth for
// your own dreams; the cloud mirrors them (private by default) and serves
// the feed of dreams your followees chose to share.
import { supabase } from './supabase'
import type { BirthChart, Dream, Mood } from './types'
import type { CachedReading } from './db'
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

export type FollowState = 'none' | 'pending' | 'accepted'

export async function followState(userId: string): Promise<FollowState> {
  if (!supabase) return 'none'
  const uid = await currentUserId()
  if (!uid) return 'none'
  const { data } = await supabase
    .from('follows')
    .select('status')
    .eq('follower', uid)
    .eq('followee', userId)
    .maybeSingle()
  return (data?.status as FollowState) ?? 'none'
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

/** Pull your own dreams from the cloud mirror and refill any that are
 *  missing locally (storage eviction, new device, failed db upgrade).
 *  Local rows always win; runs once per app session. */
let restored: Promise<number> | null = null
export function restoreMyDreams(): Promise<number> {
  restored ??= (async () => {
    if (!supabase) return 0
    const uid = await currentUserId()
    if (!uid) {
      restored = null // not signed in yet — allow a retry after sign-in
      return 0
    }
    const { data, error } = await supabase
      .from('dreams')
      .select('id, created_at, duration_sec, transcript, title, tags, mood, shared, pinned')
      .eq('user_id', uid)
    if (error || !data) return 0
    const { importMissingDreams } = await import('./db')
    return importMissingDreams(
      data.map((r: any) => ({
        id: r.id,
        createdAt: new Date(r.created_at).getTime(),
        durationSec: r.duration_sec ?? 0,
        transcript: r.transcript ?? '',
        title: r.title || 'Untitled dream',
        tags: r.tags ?? [],
        mood: r.mood ?? 'neutral',
        shared: r.shared ?? false,
        pinned: r.pinned ?? false,
        hasAudio: false, // audio blobs never leave the device
      })),
    )
  })()
  return restored
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
  const { error } = await supabase
    .from('follows')
    .insert({ follower: uid, followee: target.id, status: 'pending' })
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
    .select(`followee, profiles!follows_followee_fkey(${PROFILE_COLS})`)
    .eq('follower', uid)
    .eq('status', 'accepted')
  return (data ?? []).map((r: any) => r.profiles).filter(Boolean)
}

/** People asking to follow you — pending requests awaiting your call. */
export async function followRequests(): Promise<Profile[]> {
  if (!supabase) return []
  const uid = await currentUserId()
  if (!uid) return []
  const { data } = await supabase
    .from('follows')
    .select(`follower, profiles!follows_follower_fkey(${PROFILE_COLS})`)
    .eq('followee', uid)
    .eq('status', 'pending')
  return (data ?? []).map((r: any) => r.profiles).filter(Boolean)
}

export async function acceptRequest(followerId: string): Promise<void> {
  if (!supabase) return
  const uid = await currentUserId()
  if (!uid) return
  await supabase
    .from('follows')
    .update({ status: 'accepted' })
    .eq('follower', followerId)
    .eq('followee', uid)
}

export async function declineRequest(followerId: string): Promise<void> {
  if (!supabase) return
  const uid = await currentUserId()
  if (!uid) return
  await supabase.from('follows').delete().eq('follower', followerId).eq('followee', uid)
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

/** People who follow YOU. RLS only exposes edges you belong to, so this
 *  is accurate for the signed-in user and empty for anyone else. */
export async function followers(): Promise<Profile[]> {
  if (!supabase) return []
  const uid = await currentUserId()
  if (!uid) return []
  const { data } = await supabase
    .from('follows')
    .select(`follower, profiles!follows_follower_fkey(${PROFILE_COLS})`)
    .eq('followee', uid)
    .eq('status', 'accepted')
  return (data ?? []).map((r: any) => r.profiles).filter(Boolean)
}

export interface FollowCounts {
  followers: number
  following: number
}

export async function followCounts(userId: string): Promise<FollowCounts | null> {
  if (!supabase) return null
  const { data } = await supabase.rpc('follow_counts', { target: userId })
  return data
}

export async function friendStats(userId: string): Promise<FriendStats | null> {
  if (!supabase) return null
  const { data } = await supabase.rpc('friend_stats', { target: userId })
  return data
}

function toBirthChartRow(c: BirthChart, userId: string) {
  return {
    id: userId,
    birth_date: c.birthDate,
    birth_time: c.birthTime,
    time_unknown: c.timeUnknown,
    birth_place: c.birthPlace,
    birth_lat: c.lat ?? null,
    birth_lng: c.lng ?? null,
    birth_tz: c.timezone ?? null,
    birth_place_label: c.placeLabel ?? null,
    skipped: c.skipped,
    updated_at: new Date().toISOString(),
  }
}

function fromBirthChartRow(r: any): BirthChart {
  return {
    birthDate: r.birth_date,
    birthTime: r.birth_time,
    timeUnknown: r.time_unknown,
    birthPlace: r.birth_place,
    lat: r.birth_lat,
    lng: r.birth_lng,
    timezone: r.birth_tz,
    placeLabel: r.birth_place_label,
    skipped: r.skipped,
    updatedAt: new Date(r.updated_at).getTime(),
  }
}

export async function myBirthChart(): Promise<BirthChart | null> {
  if (!supabase) return null
  const uid = await currentUserId()
  if (!uid) return null
  const { data } = await supabase
    .from('birth_charts')
    .select(
      'birth_date, birth_time, time_unknown, birth_place, birth_lat, birth_lng, birth_tz, birth_place_label, skipped, updated_at',
    )
    .eq('id', uid)
    .maybeSingle()
  return data ? fromBirthChartRow(data) : null
}

/** Mirror the local birth chart to the cloud (no-op offline / signed out). */
export async function pushBirthChart(c: BirthChart): Promise<{ error?: string }> {
  if (!supabase) return {} // offline mode — local save is the whole story
  const uid = await currentUserId()
  if (!uid) return {} // signed out — nothing to mirror yet
  const { error } = await supabase.from('birth_charts').upsert(toBirthChartRow(c, uid))
  return error ? { error: error.message } : {}
}

// ——— sky readings (the per-dream LLM interpretation) ———
// Durable mirror of the local `readings` cache, keyed by the dream's id.

/** The cloud copy of a dream's Sky Reading, or null (offline / signed out / none). */
export async function readingForDream(id: string): Promise<CachedReading | null> {
  if (!supabase) return null
  const uid = await currentUserId()
  if (!uid) return null
  const { data } = await supabase
    .from('sky_readings')
    .select('narrative, expanded_narrative')
    .eq('id', id)
    .maybeSingle()
  return data
    ? { narrative: data.narrative ?? [], expandedNarrative: data.expanded_narrative ?? [] }
    : null
}

/** Mirror a generated Sky Reading to the cloud (no-op offline / signed out). */
export async function pushReading(id: string, reading: CachedReading): Promise<void> {
  if (!supabase) return
  const uid = await currentUserId()
  if (!uid) return
  await supabase.from('sky_readings').upsert({
    id,
    user_id: uid,
    narrative: reading.narrative,
    expanded_narrative: reading.expandedNarrative,
    updated_at: new Date().toISOString(),
  })
}

/** Drop a dream's cloud reading (on transcript edit; dream delete cascades). */
export async function deleteCloudReading(id: string): Promise<void> {
  if (!supabase) return
  const uid = await currentUserId()
  if (!uid) return
  await supabase.from('sky_readings').delete().eq('id', id)
}

/* ——— comments ——— */

export interface DreamComment {
  id: string
  dreamId: string
  userId: string
  username: string
  body: string
  createdAt: number
}

export async function listComments(dreamId: string): Promise<DreamComment[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('comments')
    .select('id, dream_id, user_id, body, created_at, profiles!comments_user_id_fkey(username)')
    .eq('dream_id', dreamId)
    .order('created_at', { ascending: true })
    .limit(200)
  return (data ?? []).map((r: any) => ({
    id: r.id,
    dreamId: r.dream_id,
    userId: r.user_id,
    username: r.profiles?.username ?? '?',
    body: r.body,
    createdAt: new Date(r.created_at).getTime(),
  }))
}

export async function addComment(
  dreamId: string,
  body: string,
): Promise<{ comment?: DreamComment; error?: string }> {
  if (!supabase) return { error: 'offline' }
  const me = await myProfile()
  if (!me) return { error: 'not signed in' }
  const { data, error } = await supabase
    .from('comments')
    .insert({ dream_id: dreamId, user_id: me.id, body })
    .select('id, created_at')
    .single()
  if (error || !data) return { error: error?.message ?? 'could not comment' }
  return {
    comment: {
      id: data.id,
      dreamId,
      userId: me.id,
      username: me.username,
      body,
      createdAt: new Date(data.created_at).getTime(),
    },
  }
}

export async function deleteComment(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('comments').delete().eq('id', id)
}
