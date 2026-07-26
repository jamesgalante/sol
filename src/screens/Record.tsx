import { useEffect, useRef, useState } from 'react'
import { startRecording, speechSupported, micDenied, type RecordingController } from '../lib/recorder'
import { categorize, detectMood, titleFrom } from '../lib/categorize'
import { saveDream, listDreams } from '../lib/db'
import { pushDream, restoreMyDreams } from '../lib/sync'
import { formatDuration, nightKey, lastNightKey } from '../lib/time'
import type { Dream } from '../lib/types'

export function Record({ onSaved }: { onSaved: (id: string) => void }) {
  const [recording, setRecording] = useState(false)
  const [saving, setSaving] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [live, setLive] = useState({ final: '', interim: '' })
  const [stats, setStats] = useState<{ total: number; lastNight: number } | null>(null)
  const [blocked, setBlocked] = useState(false)
  const controller = useRef<RecordingController | null>(null)

  useEffect(() => {
    micDenied().then(setBlocked)
    restoreMyDreams().catch(() => 0)
    listDreams().then((dreams) => {
      const lastNight = dreams.filter((d) => nightKey(d.createdAt) === lastNightKey()).length
      setStats({ total: dreams.length, lastNight })
    })
  }, [])

  useEffect(() => {
    if (!recording) return
    const started = Date.now()
    const t = setInterval(() => setElapsed((Date.now() - started) / 1000), 250)
    return () => clearInterval(t)
  }, [recording])

  async function toggle() {
    if (saving) return
    if (!recording) {
      setLive({ final: '', interim: '' })
      setElapsed(0)
      const c = startRecording()
      c.onTranscript((final, interim) => setLive({ final, interim }))
      controller.current = c
      setRecording(true)
    } else {
      setSaving(true)
      const result = await controller.current!.stop()
      controller.current = null
      setRecording(false)
      const dream: Dream = {
        id: crypto.randomUUID(),
        createdAt: Date.now() - result.durationSec * 1000,
        durationSec: result.durationSec,
        transcript: result.transcript,
        title: titleFrom(result.transcript),
        tags: categorize(result.transcript),
        mood: detectMood(result.transcript),
        hasAudio: result.audio !== null,
      }
      await saveDream(dream, result.audio ?? undefined)
      pushDream(dream) // fire-and-forget cloud mirror (private by default)
      setSaving(false)
      onSaved(dream.id)
    }
  }

  const liveText = (live.final + ' ' + live.interim).trim()

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

  return (
    <div className="record">
      <div className="record-eyebrow">{recording ? 'LISTENING' : 'BEFORE IT FADES'}</div>
      <h1 className="record-prompt">{recording ? 'Keep going…' : 'What did you dream?'}</h1>

      <div className="sun-field" data-recording={recording}>
        <div className="sun-horizon" />
        <button
          className="sun-btn"
          onClick={toggle}
          aria-label={recording ? 'Stop recording' : 'Start recording'}
        />
        {!recording && <div className="sun-mask" />}
      </div>

      {recording ? (
        <>
          <div className="record-timer">{formatDuration(elapsed)}</div>
          <div className="record-live">
            {live.final}
            {live.interim && <span className="interim"> {live.interim}</span>}
            {!liveText && <span className="interim">…</span>}
          </div>
        </>
      ) : (
        <div className="record-hint">
          {saving
            ? 'Keeping it…'
            : blocked
              ? 'No mic in this browser — tap the sun, type it after'
              : speechSupported()
                ? 'Tap the sun and speak'
                : 'Tap the sun to record — you can type the words after'}
        </div>
      )}

      {!recording && !saving && (
        <button className="quiet-btn write-instead" onClick={typeInstead}>
          or write it instead
        </button>
      )}

      {!recording && stats && stats.total > 0 && (
        <div className="record-stats">
          {stats.lastNight > 0
            ? `${stats.lastNight} dream${stats.lastNight === 1 ? '' : 's'} last night · ${stats.total} kept`
            : `${stats.total} dream${stats.total === 1 ? '' : 's'} kept`}
        </div>
      )}
    </div>
  )
}
