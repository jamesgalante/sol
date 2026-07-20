// Local-first storage. Dreams + audio blobs live in IndexedDB;
// swap this module for a real backend later without touching the screens.
import type { Dream } from './types'

const DB_NAME = 'sol'
const DB_VERSION = 1

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
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
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
