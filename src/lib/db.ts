// Local-first storage. Dreams + audio blobs live in IndexedDB;
// swap this module for a real backend later without touching the screens.
import type { BirthChart, Dream, SkyReading } from './types'

// What we cache per dream: the two narrative tiers (placements/symbolKeys are
// recomputed deterministically on view, so they never need persisting).
export type CachedReading = Pick<SkyReading, 'narrative' | 'expandedNarrative'>

const DB_NAME = 'sol'
const DB_VERSION = 3
const BIRTH_CHART_KEY = 'me'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('dreams')) {
        db.createObjectStore('dreams', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('audio')) {
        db.createObjectStore('audio')
      }
      if (!db.objectStoreNames.contains('birthChart')) {
        db.createObjectStore('birthChart')
      }
      // Cached LLM Sky Reading narratives, keyed by dream id; value = string[].
      if (!db.objectStoreNames.contains('readings')) {
        db.createObjectStore('readings')
      }
    }
    req.onsuccess = () => {
      // if another tab upgrades the schema later, release our handle so
      // the upgrade (and that tab) doesn't hang forever
      req.result.onversionchange = () => req.result.close()
      resolve(req.result)
    }
    req.onerror = () => reject(req.error)
    // an old tab holding the db open would block a version upgrade —
    // surface it instead of hanging silently with a blank journal
    req.onblocked = () => reject(new Error('database blocked by another open tab'))
  })
}

function tx<T>(
  stores: string[],
  mode: IDBTransactionMode,
  run: (t: IDBTransaction) => IDBRequest<T> | void,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(stores, mode)
        const req = run(t)
        t.oncomplete = () => resolve(req ? req.result : (undefined as T))
        t.onerror = () => reject(t.error)
      }),
  )
}

export async function listDreams(): Promise<Dream[]> {
  const dreams = await tx<Dream[]>(['dreams'], 'readonly', (t) =>
    t.objectStore('dreams').getAll(),
  )
  return dreams.sort((a, b) => b.createdAt - a.createdAt)
}

export function getDream(id: string): Promise<Dream | undefined> {
  return tx(['dreams'], 'readonly', (t) => t.objectStore('dreams').get(id))
}

export function saveDream(dream: Dream, audio?: Blob): Promise<void> {
  return tx(['dreams', 'audio'], 'readwrite', (t) => {
    t.objectStore('dreams').put(dream)
    if (audio) t.objectStore('audio').put(audio, dream.id)
  })
}

export function deleteDream(id: string): Promise<void> {
  return tx(['dreams', 'audio'], 'readwrite', (t) => {
    t.objectStore('dreams').delete(id)
    t.objectStore('audio').delete(id)
  })
}

export function getAudio(id: string): Promise<Blob | undefined> {
  return tx(['audio'], 'readonly', (t) => t.objectStore('audio').get(id))
}

/** Restore path: insert dreams that aren't already here. Existing local
 *  rows always win — local is the source of truth; this only fills gaps. */
export async function importMissingDreams(dreams: Dream[]): Promise<number> {
  if (dreams.length === 0) return 0
  const existing = new Set((await listDreams()).map((d) => d.id))
  const missing = dreams.filter((d) => !existing.has(d.id))
  if (missing.length === 0) return 0
  await tx(['dreams'], 'readwrite', (t) => {
    const store = t.objectStore('dreams')
    missing.forEach((d) => store.put(d))
  })
  return missing.length
}

export function getBirthChart(): Promise<BirthChart | undefined> {
  return tx(['birthChart'], 'readonly', (t) => t.objectStore('birthChart').get(BIRTH_CHART_KEY))
}

export function saveBirthChart(chart: BirthChart): Promise<void> {
  return tx(['birthChart'], 'readwrite', (t) => {
    t.objectStore('birthChart').put(chart, BIRTH_CHART_KEY)
  })
}

// Per-dream cache of the LLM-generated Sky Reading, so the paid call happens
// once per dream. Invalidated on transcript edit (see DreamDetail).
export async function getCachedReading(id: string): Promise<CachedReading | undefined> {
  const v = await tx(['readings'], 'readonly', (t) => t.objectStore('readings').get(id))
  // Treat as stale (→ regenerate) if: it's an old bare string[] narrative
  // (pre-expansion), the expansion tier is missing, or the main reading is only
  // the pull-quote (a malformed 1-item narrative renders with no body paragraphs).
  if (
    !v ||
    Array.isArray(v) ||
    !Array.isArray((v as CachedReading).expandedNarrative) ||
    ((v as CachedReading).narrative?.length ?? 0) < 2
  ) {
    return undefined
  }
  return v as CachedReading
}

export function saveCachedReading(id: string, reading: CachedReading): Promise<void> {
  return tx(['readings'], 'readwrite', (t) => {
    t.objectStore('readings').put(reading, id)
  })
}

export function clearCachedReading(id: string): Promise<void> {
  return tx(['readings'], 'readwrite', (t) => t.objectStore('readings').delete(id))
}
