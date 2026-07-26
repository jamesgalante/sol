import { useEffect, useRef, useState } from 'react'
import {
  getDream,
  getAudio,
  saveDream,
  deleteDream,
  getBirthChart,
  saveBirthChart,
  clearCachedNarrative,
} from '../lib/db'
import { cloudEnabled } from '../lib/supabase'
import { pushDream, deleteCloudDream, currentUserId, myBirthChart } from '../lib/sync'
import { categorize, detectMood, dreamMood, titleFrom } from '../lib/categorize'
import { Cloud, MOOD_LABEL } from '../components/Cloud'
import { SkyPanel } from '../components/SkyPanel'
import { Comments } from '../components/Comments'
import { formatClock, formatDuration, nightLabel } from '../lib/time'
import type { BirthChart, Dream, View } from '../lib/types'

export function DreamDetail({ id, onNavigate }: { id: string; onNavigate: (v: View) => void }) {
  const [dream, setDream] = useState<Dream | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const cancelTitleRef = useRef(false)
  const [signedIn, setSignedIn] = useState(false)
  const [tab, setTab] = useState<'dream' | 'sky'>('dream')
  const [birthChart, setBirthChart] = useState<BirthChart | null>(null)

  useEffect(() => {
    if (cloudEnabled()) currentUserId().then((id) => setSignedIn(Boolean(id)))
  }, [])

  // The user's own birth chart, IndexedDB-first then cloud fallback — same
  // pattern as Me.tsx/Profile.tsx. Feeds the Sky tab's reading.
  useEffect(() => {
    getBirthChart().then((local) => {
      if (local) {
        setBirthChart(local)
        return
      }
      myBirthChart().then((remote) => {
        if (remote) saveBirthChart(remote)
        setBirthChart(remote ?? null)
      })
    })
  }, [])

  useEffect(() => {
    getDream(id).then((d) => {
      if (!d) onNavigate({ name: 'journal' })
      else {
        setDream(d)
        // a dream with no transcript opens straight into typing
        if (!d.transcript) {
          setDraft('')
          setEditing(true)
        }
      }
    })
  }, [id])

  if (!dream) return null

  // A dream is "kept" once it has a saved transcript — only then is it worth
  // reading against the sky (an unrecorded dream has no symbols/mood yet).
  const kept = Boolean(dream.transcript)

  // SkyPanel now owns the reading (cache → LLM → local) and shows its own loader
  // while the narrative resolves, so opening the tab is all this needs to do.
  function openSky() {
    if (!kept) return
    setTab('sky')
  }

  async function saveEdit() {
    const transcript = draft.trim()
    // Keep a manually-set title; only regenerate one the user never touched.
    const titleWasAuto = dream!.title === titleFrom(dream!.transcript)
    const updated: Dream = {
      ...dream!,
      transcript,
      title: titleWasAuto ? titleFrom(transcript) : dream!.title,
      tags: categorize(transcript),
      mood: detectMood(transcript),
    }
    await saveDream(updated)
    // Transcript (and derived tags/mood) changed — drop the cached reading so
    // the Sky tab regenerates against the new text.
    clearCachedNarrative(updated.id)
    pushDream(updated)
    setDream(updated)
    setEditing(false)
  }

  async function saveTitle() {
    // Escape unmounts the input and fires onBlur; skip the save when cancelling.
    if (cancelTitleRef.current) {
      cancelTitleRef.current = false
      return
    }
    const title = titleDraft.trim() || 'Untitled dream'
    const updated: Dream = { ...dream!, title }
    await saveDream(updated)
    pushDream(updated)
    setDream(updated)
    setEditingTitle(false)
  }

  async function toggleShare() {
    const updated: Dream = { ...dream!, shared: !dream!.shared }
    await saveDream(updated)
    pushDream(updated)
    setDream(updated)
  }

  async function togglePin() {
    const updated: Dream = { ...dream!, pinned: !dream!.pinned }
    await saveDream(updated)
    pushDream(updated)
    setDream(updated)
  }

  async function remove() {
    if (!confirm('Let this one fade?')) return
    await deleteDream(dream!.id)
    deleteCloudDream(dream!.id)
    onNavigate({ name: 'journal' })
  }

  return (
    <div>
      <button className="back-link" onClick={() => onNavigate({ name: 'journal' })}>
        ← journal
      </button>
      {editingTitle ? (
        <input
          className="title-edit"
          value={titleDraft}
          autoFocus
          placeholder="Name this dream…"
          onChange={(e) => setTitleDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            else if (e.key === 'Escape') {
              cancelTitleRef.current = true
              setEditingTitle(false)
            }
          }}
          onBlur={saveTitle}
        />
      ) : (
        <h1
          className="detail-title"
          title="Rename"
          onClick={() => {
            setTitleDraft(dream.title)
            setEditingTitle(true)
          }}
        >
          {dream.title}
        </h1>
      )}
      <div className="detail-meta">
        <Cloud mood={dreamMood(dream)} size={14} /> {MOOD_LABEL[dreamMood(dream)].toUpperCase()} ·{' '}
        {nightLabel(dream.createdAt).toUpperCase()} · {formatClock(dream.createdAt)} ·{' '}
        {formatDuration(dream.durationSec)}
      </div>
      {dream.tags.length > 0 && (
        <div className="tag-row detail-tags">
          {dream.tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="sky-seg" role="tablist" aria-label="Dream or sky reading">
        <button
          className="sky-seg-btn"
          role="tab"
          aria-current={tab === 'dream'}
          onClick={() => setTab('dream')}
        >
          Dream
        </button>
        <button
          className="sky-seg-btn"
          role="tab"
          aria-current={tab === 'sky'}
          disabled={!kept}
          title={kept ? undefined : 'Keep this dream first'}
          onClick={openSky}
        >
          Sky
        </button>
      </div>

      {kept && tab === 'sky' ? (
        <SkyPanel dream={dream} birthChart={birthChart} onChartSaved={setBirthChart} />
      ) : (
        <>
          {dream.hasAudio && <Player id={dream.id} durationSec={dream.durationSec} />}

          {editing ? (
            <textarea
              className="transcript-edit"
              value={draft}
              autoFocus
              placeholder="Type what you remember…"
              onChange={(e) => setDraft(e.target.value)}
            />
          ) : dream.transcript ? (
            <p className="transcript">{dream.transcript}</p>
          ) : (
            <p className="transcript transcript-empty">No words were caught.</p>
          )}

          {!editing && signedIn && (dream.shared || dream.pinned) && (
            <section className="stat-section detail-comments">
              <div className="stat-heading">Comments</div>
              <Comments dreamId={dream.id} ownerView onNavigate={onNavigate} />
            </section>
          )}

          <div className="detail-actions">
            {editing ? (
              <>
                <button className="quiet-btn" onClick={saveEdit}>
                  keep
                </button>
                <button
                  className="quiet-btn"
                  onClick={async () => {
                    if (!dream.transcript) {
                      // canceling a never-written dream discards it entirely
                      await deleteDream(dream.id)
                      onNavigate({ name: 'journal' })
                      return
                    }
                    setEditing(false)
                    setDraft('')
                  }}
                >
                  cancel
                </button>
              </>
            ) : (
              <>
                <button
                  className="quiet-btn"
                  onClick={() => {
                    setDraft(dream.transcript)
                    setEditing(true)
                  }}
                >
                  edit
                </button>
                <button
                  className="quiet-btn"
                  onClick={() => {
                    setTitleDraft(dream.title)
                    setEditingTitle(true)
                  }}
                >
                  rename
                </button>
                {signedIn && (
                  <button className="quiet-btn" onClick={toggleShare}>
                    {dream.shared ? 'shared ✓ · make private' : 'share to circle'}
                  </button>
                )}
                {signedIn && (
                  <button
                    className="quiet-btn"
                    title="Pinned dreams show on your profile to anyone signed in"
                    onClick={togglePin}
                  >
                    {dream.pinned ? 'pinned ✓ · unpin' : 'pin to profile'}
                  </button>
                )}
                <button className="quiet-btn danger" onClick={remove}>
                  let it fade
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Player({ id, durationSec }: { id: string; durationSec: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [id])

  async function toggle() {
    if (!audioRef.current) {
      const blob = await getAudio(id)
      if (!blob) return
      urlRef.current = URL.createObjectURL(blob)
      const a = new Audio(urlRef.current)
      a.ontimeupdate = () => {
        const dur = isFinite(a.duration) && a.duration > 0 ? a.duration : durationSec
        setProgress(dur > 0 ? a.currentTime / dur : 0)
      }
      a.onended = () => {
        setPlaying(false)
        setProgress(0)
      }
      audioRef.current = a
    }
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      await audioRef.current.play()
      setPlaying(true)
    }
  }

  return (
    <div className="player">
      <button className="player-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? (
          <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden>
            <rect x="0" y="0" width="3.5" height="12" />
            <rect x="6.5" y="0" width="3.5" height="12" />
          </svg>
        ) : (
          <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor" aria-hidden>
            <path d="M0 0 L11 6 L0 12 Z" />
          </svg>
        )}
      </button>
      <div className="player-track">
        <div className="player-track-fill" style={{ width: `${progress * 100}%` }} />
      </div>
      <span className="player-time">{formatDuration(durationSec)}</span>
    </div>
  )
}
