"use client";

// Waveform player with karaoke line display.

import { useEffect, useMemo, useRef, useState } from "react";
import { SongPlayer, timeOfStep } from "@/lib/music/engine/render";
import type { Song } from "@/lib/music/types";

interface Props {
  song: Song;
  buffer: AudioBuffer;
  accentHue: number;
}

export default function Player({ song, buffer, accentHue }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<SongPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const rafRef = useRef(0);

  const peaks = useMemo(() => computePeaks(buffer, 480), [buffer]);

  const lines = useMemo(() => {
    const out: { text: string; start: number; end: number }[] = [];
    for (const sec of song.sections) {
      for (const l of sec.lyricLines) {
        out.push({ text: l.text, start: timeOfStep(song, l.startStep), end: timeOfStep(song, l.endStep) + 0.4 });
      }
    }
    return out;
  }, [song]);

  useEffect(() => {
    const p = new SongPlayer();
    p.setBuffer(buffer);
    p.onEnded = () => setPlaying(false);
    playerRef.current = p;
    return () => {
      cancelAnimationFrame(rafRef.current);
      p.dispose();
    };
  }, [buffer]);

  useEffect(() => {
    const tick = () => {
      const p = playerRef.current;
      if (p) setTime(p.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Draw waveform + progress.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d")!;
    const W = (canvas.width = canvas.clientWidth * 2);
    const H = (canvas.height = 112);
    g.clearRect(0, 0, W, H);
    const n = peaks.length;
    const bw = W / n;
    const progress = buffer.duration ? time / buffer.duration : 0;
    for (let i = 0; i < n; i++) {
      const h = Math.max(2, peaks[i] * (H - 8));
      const played = i / n <= progress;
      g.fillStyle = played ? `hsl(${accentHue}, 85%, 65%)` : `hsla(${accentHue}, 30%, 45%, 0.35)`;
      g.fillRect(i * bw + 0.5, (H - h) / 2, Math.max(1, bw - 1.2), h);
    }
  }, [peaks, time, buffer.duration, accentHue]);

  const currentLine = lines.find((l) => time >= l.start - 0.2 && time <= l.end);

  const toggle = () => {
    const p = playerRef.current;
    if (!p) return;
    if (p.playing) {
      p.pause();
      setPlaying(false);
    } else {
      p.play();
      setPlaying(true);
    }
  };

  const seek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    playerRef.current?.seek(ratio * buffer.duration);
    setTime(ratio * buffer.duration);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          aria-label={playing ? "Pause" : "Lecture"}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl text-black transition hover:scale-105"
          style={{ background: `hsl(${accentHue}, 85%, 65%)` }}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <canvas
          ref={canvasRef}
          onClick={seek}
          className="h-14 w-full cursor-pointer rounded-lg"
        />
        <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted">
          {fmt(time)} / {fmt(buffer.duration)}
        </span>
      </div>
      <div className="flex h-7 items-center justify-center">
        {currentLine ? (
          <p className="font-display text-base italic" style={{ color: `hsl(${accentHue}, 80%, 78%)` }}>
            {currentLine.text}
          </p>
        ) : (
          playing && song.lyrics.length > 0 && <p className="text-xs text-muted">♪ …</p>
        )}
      </div>
    </div>
  );
}

function computePeaks(buffer: AudioBuffer, buckets: number): number[] {
  const data = buffer.getChannelData(0);
  const per = Math.floor(data.length / buckets);
  const out: number[] = [];
  for (let i = 0; i < buckets; i++) {
    let max = 0;
    const start = i * per;
    for (let j = start; j < start + per; j += 24) {
      const v = Math.abs(data[j]);
      if (v > max) max = v;
    }
    out.push(Math.min(1, max * 1.4));
  }
  return out;
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
