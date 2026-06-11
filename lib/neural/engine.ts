// Client API for the neural engines: in-browser MusicGen (worker) and the
// Replicate server adapter. Both return raw PCM ready to play/store.

"use client";

export interface NeuralProgress {
  phase: "téléchargement" | "génération" | "décodage";
  pct?: number;
  detail?: string;
}

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./musicgen.worker.ts", import.meta.url));
  }
  return worker;
}

/** Generate audio with MusicGen running in the browser. */
export function generateInBrowser(
  prompt: string,
  durationSec: number,
  onProgress: (p: NeuralProgress) => void
): Promise<{ pcm: Float32Array; sampleRate: number }> {
  const w = getWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.id !== id) return;
      switch (m.type) {
        case "download":
          onProgress({ phase: "téléchargement", pct: m.pct, detail: m.file });
          break;
        case "status":
          if (m.status === "generate") onProgress({ phase: "génération", pct: 0 });
          break;
        case "generate":
          onProgress({ phase: "génération", pct: m.pct });
          break;
        case "result":
          cleanup();
          resolve({ pcm: m.pcm, sampleRate: m.sampleRate });
          break;
        case "error":
          cleanup();
          reject(new Error(m.message));
          break;
      }
    };
    const onError = (e: ErrorEvent) => {
      cleanup();
      reject(new Error(e.message || "Erreur du worker MusicGen"));
    };
    const cleanup = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ id, prompt, duration: durationSec });
  });
}

/** Generate audio through the Replicate adapter (server-side, needs a key). */
export async function generateViaReplicate(
  prompt: string,
  durationSec: number,
  onProgress: (p: NeuralProgress) => void
): Promise<{ pcm: Float32Array; sampleRate: number }> {
  onProgress({ phase: "génération", detail: "MusicGen stereo-large sur Replicate…" });
  const res = await fetch("/api/music", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, duration: Math.round(durationSec) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  onProgress({ phase: "décodage" });
  const bytes = await res.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(bytes);
    const pcm = buf.getChannelData(0).slice();
    return { pcm, sampleRate: buf.sampleRate };
  } finally {
    void ctx.close();
  }
}

/** Mono PCM → WAV blob (for IndexedDB storage / download). */
export function pcmToWavBlob(pcm: Float32Array, sampleRate: number): Blob {
  const length = pcm.length * 2 + 44;
  const out = new ArrayBuffer(length);
  const view = new DataView(out);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, length - 8, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, length - 44, true);
  let off = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([out], { type: "audio/wav" });
}
