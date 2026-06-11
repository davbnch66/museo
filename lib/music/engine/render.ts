// Offline rendering (OfflineAudioContext → AudioBuffer → WAV) and a realtime
// player with an analyser for visualizations.

import { getGenre } from "../genres";
import { midiToFreq } from "../theory";
import type { Song, TrackRole } from "../types";
import { makeReverbImpulse, playDrum, playNote } from "./synth";
import { singSyllable } from "./vocals";

const REVERB_SEND: Record<TrackRole, number> = {
  bass: 0.04,
  chords: 0.22,
  melody: 0.3,
  pad: 0.45,
  arp: 0.3,
  drone: 0.35,
  vocal: 0.32,
};

export function stepDuration(song: Song): number {
  return 60 / song.bpm / 4;
}

export function timeOfStep(song: Song, step: number): number {
  const sd = stepDuration(song);
  let t = step * sd;
  if (song.swing > 0) {
    if (step % 4 === 2) t += song.swing * sd * 0.66;
    else if (step % 2 === 1) t += song.swing * sd * 0.33;
  }
  return t;
}

export interface RenderOptions {
  /** Render only this track id, or "drums". Used for stem export. */
  only?: string | null;
  sampleRate?: number;
  /** Mute these track ids. */
  muted?: Set<string>;
}

/**
 * Multi-pass rendering: each track (then drums, then vocals) is rendered in
 * its own small OfflineAudioContext, the results are mixed in JS, and a final
 * pass applies the master compressor. Keeping each graph small makes long,
 * dense songs render reliably (a single graph can reach >10k nodes).
 */
export async function renderSong(song: Song, opts: RenderOptions = {}): Promise<AudioBuffer> {
  const sampleRate = opts.sampleRate ?? 44100;
  const length = Math.ceil(song.durationSec * sampleRate);

  const include = (id: string) => {
    if (opts.muted?.has(id)) return false;
    if (opts.only == null) return true;
    return opts.only === id;
  };

  const stems: AudioBuffer[] = [];
  for (const track of song.tracks) {
    if (track.role === "vocal") continue; // rendered below from syllables
    if (!include(track.id)) continue;
    stems.push(await renderUnit(song, length, sampleRate, (ctx, master, reverb) => {
      const bus = makeTrackBus(ctx, master, reverb, track.gain, track.pan, REVERB_SEND[track.role]);
      for (const n of track.notes) {
        const t = timeOfStep(song, n.step) + 0.05;
        const dur = Math.max(0.05, n.durSteps * stepDuration(song) * 0.95);
        playNote(ctx, bus, track.instrument, { time: t, dur, freq: midiToFreq(n.midi), vel: n.vel });
      }
    }));
  }

  if (song.drums.length && include("drums")) {
    stems.push(await renderUnit(song, length, sampleRate, (ctx, master, reverb) => {
      const bus = makeTrackBus(ctx, master, reverb, 0.9, 0, 0.12);
      for (const d of song.drums) {
        playDrum(ctx, bus, d.drum, timeOfStep(song, d.step) + 0.05, d.vel);
      }
    }));
  }

  if (song.voice && include("vocal")) {
    const voice = song.voice;
    const choir = getGenre(song.genreId).vocalStyle === "choir" || getGenre(song.genreId).vocalStyle === "chant";
    stems.push(await renderUnit(song, length, sampleRate, (ctx, master, reverb) => {
      const bus = makeTrackBus(ctx, master, reverb, 0.95, 0, REVERB_SEND.vocal);
      let prevMidi: number | null = null;
      for (const sec of song.sections) {
        for (const line of sec.lyricLines) {
          for (const syl of line.syllables) {
            const t = timeOfStep(song, syl.step) + 0.05;
            const dur = Math.max(0.08, syl.durSteps * stepDuration(song) * 0.92);
            singSyllable(ctx, bus, syl, t, dur, voice, { choir, prevMidi });
            prevMidi = syl.midi;
          }
          prevMidi = null; // breath between lines
        }
      }
    }));
  }

  // Mix stems in JS.
  const mixCtx = new OfflineAudioContext(2, length, sampleRate);
  const mixed = mixCtx.createBuffer(2, length, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const out = mixed.getChannelData(ch);
    for (const stem of stems) {
      const data = stem.getChannelData(Math.min(ch, stem.numberOfChannels - 1));
      const n = Math.min(out.length, data.length);
      for (let i = 0; i < n; i++) out[i] += data[i];
    }
  }

  // Master pass: compressor + overall gain.
  const src = mixCtx.createBufferSource();
  src.buffer = mixed;
  const master = mixCtx.createGain();
  master.gain.value = 0.75;
  const comp = mixCtx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  src.connect(master);
  master.connect(comp);
  comp.connect(mixCtx.destination);
  src.start(0);
  return mixCtx.startRendering();
}

async function renderUnit(
  song: Song,
  length: number,
  sampleRate: number,
  schedule: (ctx: OfflineAudioContext, master: AudioNode, reverb: AudioNode) => void
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
  const reverb = ctx.createConvolver();
  reverb.buffer = makeReverbImpulse(ctx, song.mood.energy < 0.3 ? 3.6 : 2.2, 2.8);
  reverb.connect(master);
  schedule(ctx, master, reverb);
  return ctx.startRendering();
}

function makeTrackBus(
  ctx: BaseAudioContext,
  master: AudioNode,
  reverb: AudioNode,
  gain: number,
  pan: number,
  send: number
): AudioNode {
  const g = ctx.createGain();
  g.gain.value = gain;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  g.connect(p);
  p.connect(master);
  const s = ctx.createGain();
  s.gain.value = send;
  g.connect(s);
  s.connect(reverb);
  return g;
}

// ---- WAV encoding ----------------------------------------------------------

export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numCh = Math.min(2, buffer.numberOfChannels);
  const length = buffer.length * numCh * 2 + 44;
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
  view.setUint16(22, numCh, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, length - 44, true);
  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

// ---- realtime player ---------------------------------------------------------

export class SongPlayer {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private buffer: AudioBuffer | null = null;
  private startedAt = 0;
  private pausedAt = 0;
  private _playing = false;
  onEnded: (() => void) | null = null;

  get playing() {
    return this._playing;
  }
  get duration() {
    return this.buffer?.duration ?? 0;
  }
  get currentTime() {
    if (!this.ctx || !this.buffer) return 0;
    return this._playing ? Math.min(this.ctx.currentTime - this.startedAt, this.buffer.duration) : this.pausedAt;
  }
  get analyser() {
    return this.analyserNode;
  }

  setBuffer(buffer: AudioBuffer) {
    this.stop();
    this.buffer = buffer;
    this.pausedAt = 0;
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.82;
      this.analyserNode.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  play(offset?: number) {
    if (!this.buffer) return;
    const ctx = this.ensureCtx();
    if (ctx.state === "suspended") void ctx.resume();
    this.stopSource();
    const from = offset ?? this.pausedAt;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.analyserNode!);
    src.onended = () => {
      if (this.source === src) {
        this._playing = false;
        this.pausedAt = 0;
        this.onEnded?.();
      }
    };
    src.start(0, Math.max(0, Math.min(from, this.buffer.duration - 0.01)));
    this.source = src;
    this.startedAt = ctx.currentTime - from;
    this._playing = true;
  }

  pause() {
    if (!this._playing) return;
    this.pausedAt = this.currentTime;
    this.stopSource();
    this._playing = false;
  }

  seek(time: number) {
    if (this._playing) this.play(time);
    else this.pausedAt = time;
  }

  stop() {
    this.stopSource();
    this._playing = false;
    this.pausedAt = 0;
  }

  private stopSource() {
    if (this.source) {
      const s = this.source;
      this.source = null;
      try {
        s.onended = null;
        s.stop();
      } catch {
        // already stopped
      }
    }
  }

  dispose() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
  }
}
