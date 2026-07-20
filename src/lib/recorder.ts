// Microphone capture + live speech-to-text.
// Uses MediaRecorder for audio and the Web Speech API (where available)
// for a free, on-device transcript. Falls back to typing in DreamDetail.
//
// Design constraints:
// - start must be instant, even while the permission prompt is open
// - stop must never hang, even if the mic was blocked or never answered

export interface RecordingResult {
  audio: Blob | null
  transcript: string
  durationSec: number
}

export interface RecordingController {
  stop(): Promise<RecordingResult>
  /** live transcript updates (final + interim) */
  onTranscript: (cb: (final: string, interim: string) => void) => void
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((e: any) => void) | null
  onend: (() => void) | null
  onerror: ((e: any) => void) | null
}

function speechRecognition(): SpeechRecognitionLike | null {
  const Ctor =
    (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
  return Ctor ? new Ctor() : null
}

export function speechSupported(): boolean {
  return Boolean(
    (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition,
  )
}

export function startRecording(): RecordingController {
  const startedAt = Date.now()
  let finalText = ''
  let interimText = ''
  let transcriptCb: ((f: string, i: string) => void) | null = null
  let stopped = false

  // --- audio: acquire in the background, never block start ---
  let recorder: MediaRecorder | null = null
  let stream: MediaStream | null = null
  const chunks: Blob[] = []
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((s) => {
      if (stopped) {
        // permission granted after the dream ended — release the mic
        s.getTracks().forEach((t) => t.stop())
        return
      }
      stream = s
      recorder = new MediaRecorder(s)
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      recorder.start()
    })
    .catch(() => {
      // mic denied — speech may still work, or the user can type
    })

  // --- speech ---
  const speech = speechRecognition()
  let speechActive = false
  if (speech) {
    speech.continuous = true
    speech.interimResults = true
    speech.lang = 'en-US'
    speech.onresult = (e: any) => {
      interimText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript + ' '
        else interimText += r[0].transcript
      }
      transcriptCb?.(finalText, interimText)
    }
    // mobile Safari ends recognition on pauses — restart while still recording
    speech.onend = () => {
      if (speechActive) {
        try {
          speech.start()
        } catch {
          /* already started */
        }
      }
    }
    speech.onerror = () => {}
    try {
      speech.start()
      speechActive = true
    } catch {
      /* unsupported after all */
    }
  }

  return {
    onTranscript(cb) {
      transcriptCb = cb
    },
    stop() {
      return new Promise<RecordingResult>((resolve) => {
        stopped = true
        const durationSec = (Date.now() - startedAt) / 1000
        if (speech && speechActive) {
          speechActive = false
          try {
            speech.stop()
          } catch {
            /* noop */
          }
        }
        let done = false
        const finish = () => {
          if (done) return
          done = true
          stream?.getTracks().forEach((t) => t.stop())
          const audio =
            chunks.length > 0
              ? new Blob(chunks, { type: chunks[0].type || 'audio/webm' })
              : null
          resolve({
            audio,
            transcript: (finalText + ' ' + interimText).replace(/\s+/g, ' ').trim(),
            durationSec,
          })
        }
        if (recorder && recorder.state !== 'inactive') {
          recorder.onstop = finish
          try {
            recorder.stop()
          } catch {
            finish()
          }
          // MediaRecorder on a dead stream can drop onstop — never hang the save
          setTimeout(finish, 1500)
        } else {
          finish()
        }
      })
    },
  }
}
