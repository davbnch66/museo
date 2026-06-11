// Local-first persistence: songs, voices and media blobs in IndexedDB.

import type { Song, VoiceConfig } from "../music/types";

const DB_NAME = "museo";
const DB_VERSION = 1;

export interface StoredVoice extends VoiceConfig {
  createdAt: number;
  /** Key into the media store for a consented user recording, if any. */
  recordingKey?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("songs")) db.createObjectStore("songs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("voices")) db.createObjectStore("voices", { keyPath: "voiceId" });
      if (!db.objectStoreNames.contains("media")) db.createObjectStore("media");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export const db = {
  saveSong: (song: Song) => tx("songs", "readwrite", (s) => s.put(song)),
  getSong: (id: string) => tx<Song | undefined>("songs", "readonly", (s) => s.get(id)),
  listSongs: async (): Promise<Song[]> => {
    const all = await tx<Song[]>("songs", "readonly", (s) => s.getAll());
    return all.sort((a, b) => b.createdAt - a.createdAt);
  },
  deleteSong: async (id: string) => {
    await tx("songs", "readwrite", (s) => s.delete(id));
    await tx("media", "readwrite", (s) => s.delete(`clip:${id}`));
    await tx("media", "readwrite", (s) => s.delete(`audio:${id}`));
  },

  saveVoice: (voice: StoredVoice) => tx("voices", "readwrite", (s) => s.put(voice)),
  listVoices: async (): Promise<StoredVoice[]> => {
    const all = await tx<StoredVoice[]>("voices", "readonly", (s) => s.getAll());
    return all.sort((a, b) => b.createdAt - a.createdAt);
  },
  deleteVoice: async (voiceId: string) => {
    await tx("voices", "readwrite", (s) => s.delete(voiceId));
    await tx("media", "readwrite", (s) => s.delete(`rec:${voiceId}`));
  },

  saveMedia: (key: string, blob: Blob) => tx("media", "readwrite", (s) => s.put(blob, key)),
  getMedia: (key: string) => tx<Blob | undefined>("media", "readonly", (s) => s.get(key)),

  clearAll: async () => {
    for (const store of ["songs", "voices", "media"]) {
      await tx(store, "readwrite", (s) => s.clear());
    }
  },
};
