"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Song } from "@/lib/music/types";
import { db } from "@/lib/store/db";

export default function LibraryPage() {
  const [songs, setSongs] = useState<Song[] | null>(null);

  useEffect(() => {
    void db.listSongs().then(setSongs);
  }, []);

  const remove = async (id: string) => {
    await db.deleteSong(id);
    setSongs((s) => s?.filter((x) => x.id !== id) ?? null);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display mb-6 text-3xl font-bold">Bibliothèque</h1>
      {songs === null && <p className="text-sm text-muted">Chargement…</p>}
      {songs?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-edge p-10 text-center text-sm text-muted">
          Aucun morceau pour l&apos;instant.{" "}
          <Link href="/" className="text-accent underline-offset-2 hover:underline">
            Composez votre premier titre →
          </Link>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {songs?.map((song) => (
          <div
            key={song.id}
            className="group relative overflow-hidden rounded-2xl border border-edge bg-surface p-4 transition hover:border-accent/50"
          >
            <div
              className="absolute inset-x-0 top-0 h-1"
              style={{ background: `hsl(${song.mood.hue}, 80%, 60%)` }}
            />
            <Link href={`/song/${song.id}`} className="block">
              <h3 className="font-display text-lg font-bold leading-tight">{song.title}</h3>
              <p className="mt-1 line-clamp-2 text-xs text-muted">{song.prompt}</p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                <span
                  className="rounded-full px-2 py-0.5"
                  style={{ background: `hsla(${song.mood.hue}, 70%, 60%, 0.15)`, color: `hsl(${song.mood.hue}, 80%, 75%)` }}
                >
                  {song.genreName}
                </span>
                <span className="rounded-full bg-surface2 px-2 py-0.5 text-muted">{song.bpm} BPM</span>
                <span className="rounded-full bg-surface2 px-2 py-0.5 text-muted">
                  {Math.floor(song.durationSec / 60)}:{String(Math.floor(song.durationSec % 60)).padStart(2, "0")}
                </span>
                <span className="rounded-full bg-surface2 px-2 py-0.5 text-muted">
                  {song.voice ? "♪ chanté" : "instrumental"}
                </span>
              </div>
            </Link>
            <button
              onClick={() => remove(song.id)}
              className="absolute right-3 top-3 hidden text-xs text-muted hover:text-red-400 group-hover:block"
              title="Supprimer"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
