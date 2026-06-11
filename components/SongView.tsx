"use client";

// Full song card: player, metadata, lyrics sheet, exports (WAV/stems),
// one-click video clip, variations and cross-genre remix.

import { useEffect, useRef, useState } from "react";
import Player from "./Player";
import { GENRES, getGenre } from "@/lib/music/genres";
import { audioBufferToWavBlob, renderSong } from "@/lib/music/engine/render";
import type { Song } from "@/lib/music/types";
import { ClipRenderer } from "@/lib/video/clip";
import { generateNeural, generateSong } from "@/lib/flow";
import { db } from "@/lib/store/db";

interface Props {
  song: Song;
  buffer: AudioBuffer;
  onReplace?: (song: Song, buffer: AudioBuffer) => void;
}

export default function SongView({ song, buffer, onReplace }: Props) {
  const hue = song.mood.hue;
  const genre = getGenre(song.genreId);
  const [busy, setBusy] = useState<string | null>(null);
  const [remixGenre, setRemixGenre] = useState("");
  const [clipOpen, setClipOpen] = useState(false);

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const slug = song.title.toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi, "-").replace(/^-|-$/g, "");

  const exportWav = () => download(audioBufferToWavBlob(buffer), `${slug}.wav`);

  const exportStems = async () => {
    setBusy("stems");
    try {
      const ids = [...song.tracks.map((t) => t.id), ...(song.drums.length ? ["drums"] : [])];
      for (const id of ids) {
        const stem = await renderSong(song, { only: id });
        download(audioBufferToWavBlob(stem), `${slug}_${id}.wav`);
        await new Promise((r) => setTimeout(r, 250));
      }
    } finally {
      setBusy(null);
    }
  };

  const isNeural = song.engine === "neural";

  const regenerate = async (newGenreId: string) => {
    if (isNeural) {
      return generateNeural(
        { prompt: song.prompt, genreId: newGenreId, durationSec: Math.round(song.durationSec), engine: "browser" },
        () => {}
      );
    }
    return generateSong({
      prompt: song.prompt,
      genreId: newGenreId,
      seed: (song.seed + 1 + Math.floor(Math.random() * 1e6)) >>> 0,
      voice: song.voice,
      instrumental: !song.voice,
    });
  };

  const makeVariation = async () => {
    setBusy("variation");
    try {
      const { song: s2, buffer: b2 } = await regenerate(song.genreId);
      onReplace?.(s2, b2);
    } finally {
      setBusy(null);
    }
  };

  const remix = async () => {
    if (!remixGenre) return;
    setBusy("remix");
    try {
      const { song: s2, buffer: b2 } = await regenerate(remixGenre);
      onReplace?.(s2, b2);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="rounded-2xl border border-edge bg-surface p-5 md:p-6"
      style={{ boxShadow: `0 0 80px -30px hsl(${hue}, 80%, 50%, 0.5)` }}
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl font-bold md:text-3xl">{song.title}</h2>
          <p className="mt-1 text-sm text-muted">{song.prompt}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Chip hue={hue}>{song.genreName}</Chip>
          <Chip hue={hue}>{genre.era}</Chip>
          {!isNeural && <Chip hue={hue}>{song.bpm} BPM</Chip>}
          {isNeural && <Chip hue={hue}>🧠 neuronal</Chip>}
          {song.voice && <Chip hue={hue}>voix : {song.voice.name}</Chip>}
          {!song.voice && !isNeural && <Chip hue={hue}>instrumental</Chip>}
        </div>
      </div>

      <Player song={song} buffer={buffer} accentHue={hue} />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Action onClick={exportWav}>⬇ WAV</Action>
        {!isNeural && (
          <Action onClick={exportStems} disabled={busy !== null}>
            {busy === "stems" ? "Export…" : "⬇ Stems"}
          </Action>
        )}
        <Action onClick={() => setClipOpen(true)} highlight hue={hue}>
          ▣ Clip vidéo
        </Action>
        <Action onClick={makeVariation} disabled={busy !== null}>
          {busy === "variation" ? "Création…" : "⟳ Variation"}
        </Action>
        <span className="ml-auto flex items-center gap-2">
          <select
            value={remixGenre}
            onChange={(e) => setRemixGenre(e.target.value)}
            className="rounded-lg border border-edge bg-surface2 px-2 py-1.5 text-xs text-foreground"
          >
            <option value="">Remixer en…</option>
            {GENRES.filter((g) => g.id !== song.genreId).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <Action onClick={remix} disabled={!remixGenre || busy !== null}>
            {busy === "remix" ? "Remix…" : "Go"}
          </Action>
        </span>
      </div>

      {song.lyrics.length > 0 && (
        <details className="mt-5 rounded-xl border border-edge bg-surface2 p-4" open>
          <summary className="cursor-pointer text-sm font-semibold text-muted">Paroles</summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {dedupeLyrics(song).map((sec, i) => (
              <div key={i}>
                <p className="mb-1 text-xs uppercase tracking-wide" style={{ color: `hsl(${hue}, 70%, 70%)` }}>
                  {sectionLabel(sec.type)}
                </p>
                {sec.lines.map((l, j) => (
                  <p key={j} className="font-display text-sm leading-relaxed">
                    {l}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}

      {clipOpen && <ClipModal song={song} buffer={buffer} onClose={() => setClipOpen(false)} />}
    </div>
  );
}

function dedupeLyrics(song: Song) {
  const seen = new Set<string>();
  return song.lyrics.filter((s) => {
    const key = s.type + s.lines.join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sectionLabel(t: string): string {
  return (
    { verse: "Couplet", chorus: "Refrain", prechorus: "Pré-refrain", bridge: "Pont", drop: "Drop", breakdown: "Breakdown" }[t] ?? t
  );
}

function Chip({ children, hue }: { children: React.ReactNode; hue: number }) {
  return (
    <span
      className="rounded-full px-2.5 py-1"
      style={{ background: `hsla(${hue}, 70%, 60%, 0.15)`, color: `hsl(${hue}, 80%, 75%)` }}
    >
      {children}
    </span>
  );
}

function Action({
  children,
  onClick,
  disabled,
  highlight,
  hue,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  highlight?: boolean;
  hue?: number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-edge px-3 py-1.5 text-xs font-medium transition hover:bg-surface2 disabled:opacity-40"
      style={highlight ? { background: `hsla(${hue}, 80%, 60%, 0.18)`, borderColor: `hsla(${hue}, 80%, 60%, 0.5)` } : undefined}
    >
      {children}
    </button>
  );
}

// ---- Video clip modal --------------------------------------------------------

function ClipModal({ song, buffer, onClose }: { song: Song; buffer: AudioBuffer; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ClipRenderer | null>(null);
  const [state, setState] = useState<"idle" | "filming" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [existing, setExisting] = useState(false);

  useEffect(() => {
    void db.getMedia(`clip:${song.id}`).then((blob) => {
      if (blob) {
        setClipUrl(URL.createObjectURL(blob));
        setExisting(true);
        setState("done");
      }
    });
    return () => {
      rendererRef.current?.cancel();
    };
  }, [song.id]);

  const start = async () => {
    if (!canvasRef.current) return;
    setState("filming");
    setExisting(false);
    setClipUrl(null);
    const renderer = new ClipRenderer();
    renderer.onProgress = setProgress;
    rendererRef.current = renderer;
    try {
      const blob = await renderer.generate(song, buffer, canvasRef.current);
      await db.saveMedia(`clip:${song.id}`, blob);
      setClipUrl(URL.createObjectURL(blob));
      setState("done");
    } catch {
      setState("error");
    }
  };

  const downloadClip = () => {
    if (!clipUrl) return;
    const a = document.createElement("a");
    a.href = clipUrl;
    a.download = `${song.title.toLowerCase().replace(/\s+/g, "-")}-clip.webm`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-2xl border border-edge bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-xl font-bold">Clip vidéo — {song.title}</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>
        <p className="mb-3 text-xs text-muted">
          Museo analyse les paroles, le thème et l&apos;énergie du morceau, puis filme le clip en temps réel
          (typographie karaoké + scènes audio-réactives). Gardez cet onglet visible pendant le tournage.
        </p>

        {state === "done" && clipUrl ? (
          <video src={clipUrl} controls className="aspect-video w-full rounded-xl bg-black" />
        ) : (
          <canvas ref={canvasRef} className="aspect-video w-full rounded-xl bg-black" />
        )}

        <div className="mt-4 flex items-center gap-3">
          {state === "idle" && (
            <button
              onClick={start}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
            >
              🎬 Générer le clip
            </button>
          )}
          {state === "filming" && (
            <>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface2">
                <div className="h-full bg-accent transition-all" style={{ width: `${progress * 100}%` }} />
              </div>
              <span className="text-xs text-muted">tournage… {Math.round(progress * 100)}%</span>
            </>
          )}
          {state === "done" && (
            <>
              <button onClick={downloadClip} className="rounded-lg border border-edge px-3 py-1.5 text-xs hover:bg-surface2">
                ⬇ Télécharger (.webm)
              </button>
              <button onClick={start} className="rounded-lg border border-edge px-3 py-1.5 text-xs hover:bg-surface2">
                ⟳ Re-tourner
              </button>
              {existing && <span className="text-xs text-muted">clip déjà en bibliothèque</span>}
            </>
          )}
          {state === "error" && (
            <span className="text-xs text-red-400">
              Échec de l&apos;enregistrement — votre navigateur supporte-t-il MediaRecorder ?
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
