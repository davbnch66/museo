"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import SongView from "@/components/SongView";
import type { Song } from "@/lib/music/types";
import { ensureBuffer } from "@/lib/flow";
import { db } from "@/lib/store/db";

export default function SongPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<"loading" | "rendering" | "ready" | "missing">("loading");
  const [data, setData] = useState<{ song: Song; buffer: AudioBuffer } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const song = await db.getSong(id);
      if (!song) {
        if (!cancelled) setState("missing");
        return;
      }
      setState("rendering");
      const buffer = await ensureBuffer(song);
      if (!cancelled) {
        setData({ song, buffer });
        setState("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state === "missing") {
    return (
      <p className="text-sm text-muted">
        Morceau introuvable.{" "}
        <Link href="/library" className="text-accent hover:underline">
          Retour à la bibliothèque
        </Link>
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/library" className="mb-4 inline-block text-xs text-muted hover:text-foreground">
        ← Bibliothèque
      </Link>
      {state !== "ready" && (
        <p className="text-sm text-muted">
          {state === "rendering" ? "Le morceau se ré-enregistre…" : "Chargement…"}
        </p>
      )}
      {data && (
        <SongView
          song={data.song}
          buffer={data.buffer}
          onReplace={(song) => router.push(`/song/${song.id}`)}
        />
      )}
    </div>
  );
}
