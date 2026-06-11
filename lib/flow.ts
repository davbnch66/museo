// Client-side generation pipeline: compose → (pro lyrics if configured) →
// offline render → persist. Keeps rendered buffers in memory across pages.

"use client";

import { composeSong, ComposeOptions } from "./music/composer";
import { renderSong } from "./music/engine/render";
import { getGenre, matchGenre, STRUCTURES } from "./music/genres";
import { analyzePrompt } from "./music/prompt";
import type { Song } from "./music/types";
import { db } from "./store/db";

const bufferCache = new Map<string, AudioBuffer>();

export function getCachedBuffer(songId: string): AudioBuffer | undefined {
  return bufferCache.get(songId);
}

export function cacheBuffer(songId: string, buf: AudioBuffer) {
  if (bufferCache.size > 12) {
    const first = bufferCache.keys().next().value;
    if (first) bufferCache.delete(first);
  }
  bufferCache.set(songId, buf);
}

export type Stage = "écriture" | "composition" | "interprétation" | "terminé";

export async function generateSong(
  opts: ComposeOptions & { useProLyrics?: boolean },
  onStage?: (s: Stage) => void
): Promise<{ song: Song; buffer: AudioBuffer }> {
  let customLyrics = opts.customLyrics ?? null;

  // Try the Claude lyric adapter when requested and not instrumental.
  if (opts.useProLyrics && !opts.instrumental && !customLyrics) {
    onStage?.("écriture");
    try {
      const genre = opts.genreId ? getGenre(opts.genreId) : matchGenre(opts.prompt).genre;
      const analysis = analyzePrompt(opts.prompt, genre.hue, genre.energy);
      const structure = STRUCTURES[genre.structures[0]].map((s) => s.type);
      const res = await fetch("/api/lyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: opts.prompt,
          genre: genre.name,
          structure,
          language: analysis.language,
          title: analysis.title,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { sections?: { type: string; lines: string[] }[] };
        if (json.sections?.length) {
          customLyrics = json.sections
            .filter((s) => s.lines?.length)
            .map((s) => s.lines.join("\n"))
            .join("\n\n");
        }
      }
    } catch {
      // local lyric engine takes over
    }
  }

  onStage?.("composition");
  const song = composeSong({ ...opts, customLyrics });

  onStage?.("interprétation");
  // Yield to the UI before the heavy offline render.
  await new Promise((r) => setTimeout(r, 30));
  const buffer = await renderSong(song);

  cacheBuffer(song.id, buffer);
  await db.saveSong(song);
  onStage?.("terminé");
  return { song, buffer };
}

export async function ensureBuffer(song: Song): Promise<AudioBuffer> {
  const cached = bufferCache.get(song.id);
  if (cached) return cached;
  const buffer = await renderSong(song);
  cacheBuffer(song.id, buffer);
  return buffer;
}
