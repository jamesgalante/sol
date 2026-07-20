import { useEffect, useRef, useState } from 'react'
import { getDream, getAudio, saveDream, deleteDream } from '../lib/db'
import { categorize, titleFrom } from '../lib/categorize'
import { formatClock, formatDuration, nightLabel } from '../lib/time'
import type { Dream, View } from '../lib/types'

export function DreamDetail({ id, onNavigate }: { id: string; onNavigate: (v: View) => void }) {
  const [dream, setDream] = useState<Dream | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

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

  async function saveEdit() {
    const transcript = draft.trim()
    const updated: Dream = {
      ...dream!,
      transcript,
      title: titleFrom(transcript),
      tags: categorize(transcript),
    }
    await saveDream(updated)
    setDream(updated)
    setEditing(false)
  }

  async function remove() {
    if (!confirm('Let this one fade?')) return
    await deleteDream(dream!.id)
    onNavigate({ name: 'journal' })
  }

  return (
    <div>
      <button className="back-link" onClick={() => onNavigate({ name: 'journal' })}>
        ← journal
      </button>
      <h1 className="detail-title">{dream.title}</h1>
      <div className="detail-meta">
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

      <div className="detail-actions">
        {editing ? (
          <>
            <button className="quiet-btn" onClick={saveEdit}>
              keep
            </button>
            <button
              className="quiet-btn"
              onClick={() => {
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
            <button className="quiet-btn danger" onClick={remove}>
              let it fade
            </button>
          </>
        )}
      </div>
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
