import { useEffect, useRef, useState } from 'react'
import { startRecording, speechSupported, micDenied, type RecordingController } from '../lib/recorder'
import { transcribeAudio } from '../lib/transcribe'
import { categorize, detectMood, titleFrom } from '../lib/categorize'
import { saveDream, listDreams } from '../lib/db'
import { pushDream, restoreMyDreams } from '../lib/sync'
import { formatDuration, nightKey, lastNightKey } from '../lib/time'
import type { Dream } from '../lib/types'

// idle → recording → (transcribing) → review → save. The dream is only written
// to IndexedDB once the user approves the text in review, so they always get to
// read and edit before it's kept.
type Phase = 'idle' | 'recording' | 'transcribing' | 'review'

export function Record({ onSaved }: { onSaved: (id: string) => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [saving, setSaving] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [live, setLive] = useState({ final: '', interim: '' })
  const [draft, setDraft] = useState('')
  const [stats, setStats] = useState<{ total: number; lastNight: number } | null>(null)
  const [blocked, setBlocked] = useState(false)
  const controller = useRef<RecordingController | null>(null)
  const audioRef = useRef<Blob | null>(null)
  const durationRef = useRef(0)

  useEffect(() => {
    micDenied().then(setBlocked)
    restoreMyDreams().catch(() => 0)
    listDreams().then((dreams) => {
      const lastNight = dreams.filter((d) => nightKey(d.createdAt) === lastNightKey()).length
      setStats({ total: dreams.length, lastNight })
    })
  }, [])

  useEffect(() => {
    if (phase !== 'recording') return
    const started = Date.now()
    const t = setInterval(() => setElapsed((Date.now() - started) / 1000), 250)
    return () => clearInterval(t)
  }, [phase])

  function start() {
    setLive({ final: '', interim: '' })
    setElapsed(0)
    const c = startRecording()
    c.onTranscript((final, interim) => setLive({ final, interim }))
    controller.current = c
    setPhase('recording')
  }

  // Stop capture, then decide how we get the transcript: the browser's live
  // Web Speech text if it caught anything, else a server transcription of the
  // recorded audio, else an empty draft the user types into.
  async function done() {
    const c = controller.current
    if (!c) return
    controller.current = null
    const result = await c.stop()
    audioRef.current = result.audio
    durationRef.current = result.durationSec

    if (result.transcript) {
      setDraft(result.transcript)
      setPhase('review')
      return
    }
    if (result.audio) {
      setPhase('transcribing')
      try {
        setDraft(await transcribeAudio(result.audio))
      } catch {
        setDraft('') // not enabled / offline / failed — user types it after
      }
      setPhase('review')
      return
    }
    setDraft('')
    setPhase('review')
  }

  async function keep() {
    if (saving) return
    setSaving(true)
    const transcript = draft.trim()
    const audio = audioRef.current
    const durationSec = durationRef.current
    const dream: Dream = {
      id: crypto.randomUUID(),
      createdAt: Date.now() - durationSec * 1000,
      durationSec,
      transcript,
      title: titleFrom(transcript),
      tags: categorize(transcript),
      mood: detectMood(transcript),
      hasAudio: audio !== null,
    }
    await saveDream(dream, audio ?? undefined)
    pushDream(dream) // fire-and-forget cloud mirror (private by default)
    onSaved(dream.id)
  }

  function discard() {
    if (saving) return
    audioRef.current = null
    durationRef.current = 0
    setDraft('')
    setLive({ final: '', interim: '' })
    setPhase('idle')
  }

  async function typeInstead() {
    const dream: Dream = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      durationSec: 0,
      transcript: '',
      title: 'Untitled dream',
      tags: [],
      mood: 'neutral',
      hasAudio: false,
    }
    await saveDream(dream)
    onSaved(dream.id) // detail opens straight into typing for empty dreams
  }

  const recording = phase === 'recording'
  const liveText = (live.final + ' ' + live.interim).trim()

  const eyebrow =
    phase === 'recording' ? 'LISTENING' : phase === 'transcribing' ? 'CATCHING IT' : phase === 'review' ? 'YOUR DREAM' : 'BEFORE IT FADES'
  const prompt =
    phase === 'recording'
      ? 'Keep going…'
      : phase === 'transcribing'
        ? 'One moment…'
        : phase === 'review'
          ? 'Does this sound right?'
          : 'What did you dream?'

  return (
    <div className="record">
      <div className="record-eyebrow">{eyebrow}</div>
      <h1 className="record-prompt">{prompt}</h1>

      {(phase === 'idle' || phase === 'recording') && (
        <div className="sun-field" data-recording={recording}>
          <div className="sun-horizon" />
          <button
            className="sun-btn"
            onClick={recording ? done : start}
            aria-label={recording ? 'Stop recording' : 'Start recording'}
          />
          {!recording && <div className="sun-mask" />}
        </div>
      )}

      {phase === 'recording' && (
        <>
          <div className="record-timer">{formatDuration(elapsed)}</div>
          <div className="record-live">
            {live.final}
            {live.interim && <span className="interim"> {live.interim}</span>}
            {!liveText && <span className="interim">…</span>}
          </div>
          <button className="record-done" onClick={done}>
            done
          </button>
        </>
      )}

      {phase === 'transcribing' && <div className="record-hint">making out the words…</div>}

      {phase === 'review' && (
        <div className="record-review">
          <textarea
            className="transcript-edit"
            value={draft}
            autoFocus
            placeholder="Type what you remember…"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="record-review-actions">
            <button className="quiet-btn" onClick={keep} disabled={saving}>
              {saving ? 'keeping…' : 'keep'}
            </button>
            <button className="quiet-btn" onClick={discard} disabled={saving}>
              discard
            </button>
          </div>
        </div>
      )}

      {phase === 'idle' && (
        <>
          <div className="record-hint">
            {blocked
              ? 'No mic in this browser — tap the sun, type it after'
              : speechSupported()
                ? 'Tap the sun and speak'
                : 'Tap the sun to record — you can type the words after'}
          </div>

          <button className="quiet-btn write-instead" onClick={typeInstead}>
            or write it instead
          </button>

          {stats && stats.total > 0 && (
            <div className="record-stats">
              {stats.lastNight > 0
                ? `${stats.lastNight} dream${stats.lastNight === 1 ? '' : 's'} last night · ${stats.total} kept`
                : `${stats.total} dream${stats.total === 1 ? '' : 's'} kept`}
            </div>
          )}
        </>
      )}
    </div>
  )
}
