// Instrument & drum synthesis on Web Audio. Every instrument is synthesized
// from oscillators/noise — no samples — so the whole engine works offline.

import type { InstrumentId } from "../genres";
import type { DrumName } from "../types";

// ---- shared resources -----------------------------------------------------

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

export function getNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

let distCurve: Float32Array | null = null;
function getDistCurve(): Float32Array {
  if (!distCurve) {
    const n = 1024;
    distCurve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      distCurve[i] = Math.tanh(x * 4);
    }
  }
  return distCurve;
}

export function makeReverbImpulse(ctx: BaseAudioContext, seconds = 2.4, decay = 3): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function env(g: AudioParam, t: number, dur: number, a: number, d: number, s: number, r: number, peak: number) {
  const sus = Math.max(t + a + d, t + dur);
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t + Math.max(a, 0.003));
  g.exponentialRampToValueAtTime(Math.max(peak * s, 0.0001), t + a + Math.max(d, 0.01));
  g.setValueAtTime(Math.max(peak * s, 0.0001), sus);
  g.exponentialRampToValueAtTime(0.0001, sus + Math.max(r, 0.02));
}

interface NoteParams {
  time: number;
  dur: number;
  freq: number;
  vel: number;
}

type Stopper = { start: number; stop: number };

function osc(ctx: BaseAudioContext, type: OscillatorType, freq: number, t: number, stop: number, detune = 0): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.setValueAtTime(detune, t);
  o.start(t);
  o.stop(stop);
  return o;
}

// ---- generic builders -------------------------------------------------------

/** Subtractive synth: layered oscs → lowpass (optional env) → amp env. */
function subtractive(
  ctx: BaseAudioContext,
  dest: AudioNode,
  p: NoteParams,
  oscs: { type: OscillatorType; detune?: number; ratio?: number; gain?: number }[],
  opts: {
    a?: number; d?: number; s?: number; r?: number;
    cutoff?: number; cutoffKey?: number; q?: number; filterEnv?: number; filterDecay?: number;
    peak?: number;
  } = {}
) {
  const { a = 0.005, d = 0.08, s = 0.7, r = 0.15, peak = 0.25 } = opts;
  const stop = p.time + p.dur + r + 0.3;
  const amp = ctx.createGain();
  env(amp.gain, p.time, p.dur, a, d, s, r, peak * p.vel);

  let head: AudioNode = amp;
  if (opts.cutoff) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    const base = opts.cutoff + (opts.cutoffKey ?? 0) * p.freq;
    f.Q.value = opts.q ?? 0.8;
    if (opts.filterEnv) {
      f.frequency.setValueAtTime(base + opts.filterEnv, p.time);
      f.frequency.exponentialRampToValueAtTime(Math.max(base, 40), p.time + (opts.filterDecay ?? 0.2));
    } else {
      f.frequency.setValueAtTime(base, p.time);
    }
    f.connect(amp);
    head = f;
  }
  for (const o of oscs) {
    const node = osc(ctx, o.type, p.freq * (o.ratio ?? 1), p.time, stop, o.detune ?? 0);
    if (o.gain !== undefined && o.gain !== 1) {
      const g = ctx.createGain();
      g.gain.value = o.gain;
      node.connect(g);
      g.connect(head);
    } else {
      node.connect(head);
    }
  }
  amp.connect(dest);
}

/**
 * Karplus-Strong pluck, precomputed into an AudioBuffer (no feedback-loop
 * nodes: Web Audio clamps cycles to 128 samples, which would detune any
 * pluck above ~345 Hz). Buffers are cached per context.
 */
const pluckCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

function pluck(
  ctx: BaseAudioContext,
  dest: AudioNode,
  p: NoteParams,
  opts: { brightness?: number; sustain?: number; peak?: number; bendDown?: number } = {}
) {
  const { brightness = 4000, sustain = 0.96, peak = 0.5, bendDown = 0 } = opts;
  const t = p.time;
  const sr = ctx.sampleRate;
  const durSec = Math.min(p.dur + 1.2, 3);

  let cache = pluckCache.get(ctx);
  if (!cache) {
    cache = new Map();
    pluckCache.set(ctx, cache);
  }
  const key = `${p.freq.toFixed(1)}|${durSec.toFixed(2)}|${brightness}|${sustain}`;
  let buf = cache.get(key);
  if (!buf) {
    const len = Math.max(64, Math.floor(sr * durSec));
    buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const period = Math.max(2, Math.round(sr / p.freq));
    const ring = new Float32Array(period);
    // Noise burst, pre-filtered by a one-pole lowpass (pick brightness).
    const a = Math.min(1, Math.max(0.05, brightness / 6000));
    let lp = 0;
    for (let i = 0; i < period; i++) {
      lp += a * (Math.random() * 2 - 1 - lp);
      ring[i] = lp;
    }
    // KS loop: averaging + loss, written straight into the buffer.
    const fadeStart = len - Math.floor(sr * 0.04);
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const cur = ring[idx];
      const nxt = ring[(idx + 1) % period];
      ring[idx] = sustain * 0.5 * (cur + nxt);
      out[i] = i >= fadeStart ? cur * (1 - (i - fadeStart) / (len - fadeStart)) : cur;
      idx = (idx + 1) % period;
    }
    if (cache.size > 400) cache.clear();
    cache.set(key, buf);
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (bendDown > 0) {
    src.playbackRate.setValueAtTime(1, t);
    src.playbackRate.linearRampToValueAtTime(1 - bendDown, t + 0.4);
  }
  const out = ctx.createGain();
  out.gain.value = peak * p.vel;
  src.connect(out);
  out.connect(dest);
  src.start(t);
}

/** 2-operator FM for bells / metallophones / e-piano tines. */
function fmBell(
  ctx: BaseAudioContext,
  dest: AudioNode,
  p: NoteParams,
  opts: { ratio?: number; index?: number; decay?: number; peak?: number; a?: number } = {}
) {
  const { ratio = 3.51, index = 300, decay = 1.2, peak = 0.3, a = 0.004 } = opts;
  const t = p.time;
  const stop = t + decay + 0.5;
  const carrier = osc(ctx, "sine", p.freq, t, stop);
  const mod = osc(ctx, "sine", p.freq * ratio, t, stop);
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(index * (p.freq / 220), t);
  modGain.gain.exponentialRampToValueAtTime(1, t + decay * 0.7);
  mod.connect(modGain);
  modGain.connect(carrier.frequency);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(peak * p.vel, t + a);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  carrier.connect(amp);
  amp.connect(dest);
}

// ---- instrument dispatch ----------------------------------------------------

export function playNote(ctx: BaseAudioContext, dest: AudioNode, inst: InstrumentId, p: NoteParams) {
  switch (inst) {
    case "subBass":
      subtractive(ctx, dest, p, [{ type: "sine" }, { type: "triangle", gain: 0.3 }], { a: 0.008, d: 0.1, s: 0.85, r: 0.1, peak: 0.5 });
      break;
    case "bass808": {
      const t = p.time;
      const stop = t + p.dur + 0.4;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(p.freq * 2.5, t);
      o.frequency.exponentialRampToValueAtTime(p.freq, t + 0.06);
      o.start(t);
      o.stop(stop);
      const sat = ctx.createWaveShaper();
      sat.curve = getDistCurve() as Float32Array<ArrayBuffer>;
      const amp = ctx.createGain();
      env(amp.gain, t, p.dur, 0.005, 0.1, 0.8, 0.25, 0.45 * p.vel);
      o.connect(sat);
      sat.connect(amp);
      amp.connect(dest);
      break;
    }
    case "pluckBass":
      pluck(ctx, dest, p, { brightness: 900, sustain: 0.93, peak: 0.55 });
      break;
    case "uprightBass":
      subtractive(ctx, dest, p, [{ type: "triangle" }, { type: "sawtooth", gain: 0.12 }], { a: 0.01, d: 0.25, s: 0.4, r: 0.15, cutoff: 350, cutoffKey: 1.5, peak: 0.5 });
      break;
    case "fingerBass":
      subtractive(ctx, dest, p, [{ type: "sawtooth" }, { type: "square", gain: 0.3, ratio: 0.5 }], { a: 0.005, d: 0.18, s: 0.5, r: 0.08, cutoff: 300, cutoffKey: 2, filterEnv: 900, filterDecay: 0.12, peak: 0.42 });
      break;
    case "piano":
      subtractive(ctx, dest, p, [{ type: "triangle" }, { type: "sawtooth", gain: 0.15 }, { type: "sine", ratio: 2, gain: 0.2 }], { a: 0.003, d: 0.6, s: 0.18, r: 0.25, cutoff: 1200, cutoffKey: 3, peak: 0.3 });
      break;
    case "epiano":
      fmBell(ctx, dest, p, { ratio: 14, index: 14, decay: Math.min(p.dur + 0.6, 1.4), peak: 0.18 });
      subtractive(ctx, dest, p, [{ type: "sine" }, { type: "sine", ratio: 2, gain: 0.18 }], { a: 0.004, d: 0.5, s: 0.3, r: 0.3, peak: 0.26 });
      break;
    case "organ":
      subtractive(
        ctx, dest, p,
        [{ type: "sine" }, { type: "sine", ratio: 2, gain: 0.6 }, { type: "sine", ratio: 3, gain: 0.3 }, { type: "sine", ratio: 4, gain: 0.2 }],
        { a: 0.02, d: 0.05, s: 0.9, r: 0.08, peak: 0.18 }
      );
      break;
    case "harpsichord":
      pluck(ctx, dest, p, { brightness: 6000, sustain: 0.94, peak: 0.4 });
      break;
    case "nylonGuitar":
      pluck(ctx, dest, p, { brightness: 2600, sustain: 0.95, peak: 0.5 });
      break;
    case "steelGuitar":
      pluck(ctx, dest, p, { brightness: 4200, sustain: 0.96, peak: 0.45 });
      break;
    case "distGuitar": {
      const t = p.time;
      const stop = t + p.dur + 0.3;
      const pre = ctx.createGain();
      pre.gain.value = 2.5;
      const sat = ctx.createWaveShaper();
      sat.curve = getDistCurve() as Float32Array<ArrayBuffer>;
      sat.oversample = "2x";
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 3200;
      const amp = ctx.createGain();
      env(amp.gain, t, p.dur, 0.005, 0.05, 0.8, 0.12, 0.16 * p.vel);
      osc(ctx, "sawtooth", p.freq, t, stop, -7).connect(pre);
      osc(ctx, "sawtooth", p.freq, t, stop, 7).connect(pre);
      osc(ctx, "square", p.freq / 2, t, stop).connect(pre);
      pre.connect(sat);
      sat.connect(f);
      f.connect(amp);
      amp.connect(dest);
      break;
    }
    case "strings":
      subtractive(ctx, dest, p, [{ type: "sawtooth", detune: -8 }, { type: "sawtooth", detune: 8 }, { type: "sawtooth", ratio: 2, gain: 0.15 }], { a: 0.25, d: 0.2, s: 0.85, r: 0.5, cutoff: 1800, cutoffKey: 2, peak: 0.14 });
      break;
    case "staccatoStrings":
      subtractive(ctx, dest, p, [{ type: "sawtooth", detune: -6 }, { type: "sawtooth", detune: 6 }], { a: 0.012, d: 0.12, s: 0.3, r: 0.08, cutoff: 2200, cutoffKey: 2, peak: 0.2 });
      break;
    case "brass":
      subtractive(ctx, dest, p, [{ type: "sawtooth" }, { type: "sawtooth", detune: 10, gain: 0.6 }], { a: 0.05, d: 0.15, s: 0.8, r: 0.15, cutoff: 600, cutoffKey: 2, filterEnv: 2000, filterDecay: 0.18, peak: 0.2 });
      break;
    case "trumpet":
      subtractive(ctx, dest, p, [{ type: "sawtooth" }], { a: 0.04, d: 0.1, s: 0.8, r: 0.12, cutoff: 900, cutoffKey: 2.5, filterEnv: 1500, filterDecay: 0.1, q: 2, peak: 0.22 });
      break;
    case "sax":
      subtractive(ctx, dest, p, [{ type: "sawtooth" }, { type: "square", gain: 0.4 }], { a: 0.06, d: 0.12, s: 0.75, r: 0.15, cutoff: 800, cutoffKey: 2, q: 3, filterEnv: 600, filterDecay: 0.15, peak: 0.2 });
      break;
    case "flute": {
      subtractive(ctx, dest, p, [{ type: "triangle" }, { type: "sine", ratio: 2, gain: 0.15 }], { a: 0.08, d: 0.1, s: 0.85, r: 0.2, peak: 0.25 });
      // breath noise
      const t = p.time;
      const n = ctx.createBufferSource();
      n.buffer = getNoiseBuffer(ctx);
      n.start(t, Math.random(), p.dur + 0.2);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = p.freq * 2;
      bp.Q.value = 8;
      const g = ctx.createGain();
      env(g.gain, t, p.dur, 0.08, 0.1, 0.6, 0.15, 0.04 * p.vel);
      n.connect(bp);
      bp.connect(g);
      g.connect(dest);
      break;
    }
    case "panFlute":
      subtractive(ctx, dest, p, [{ type: "triangle" }], { a: 0.05, d: 0.15, s: 0.7, r: 0.2, peak: 0.25 });
      break;
    case "violin":
      subtractive(ctx, dest, p, [{ type: "sawtooth" }, { type: "sawtooth", detune: 6, gain: 0.5 }], { a: 0.12, d: 0.2, s: 0.85, r: 0.3, cutoff: 2400, cutoffKey: 2, q: 1.5, peak: 0.16 });
      break;
    case "sitar":
      pluck(ctx, dest, p, { brightness: 7000, sustain: 0.975, peak: 0.4, bendDown: 0.015 });
      break;
    case "koto":
      pluck(ctx, dest, p, { brightness: 3400, sustain: 0.955, peak: 0.5, bendDown: 0.01 });
      break;
    case "kalimba":
      fmBell(ctx, dest, p, { ratio: 5.4, index: 80, decay: 1.0, peak: 0.35 });
      break;
    case "marimba":
      fmBell(ctx, dest, p, { ratio: 3.97, index: 120, decay: 0.5, peak: 0.4 });
      break;
    case "bell":
      fmBell(ctx, dest, p, { ratio: 3.51, index: 250, decay: 1.8, peak: 0.28 });
      break;
    case "gamelanMetal":
      fmBell(ctx, dest, p, { ratio: 2.76, index: 350, decay: 2.2, peak: 0.3 });
      break;
    case "padWarm":
      subtractive(ctx, dest, p, [{ type: "sawtooth", detune: -10 }, { type: "sawtooth", detune: 10 }, { type: "triangle", ratio: 0.5, gain: 0.5 }], { a: 0.6, d: 0.3, s: 0.9, r: 1.2, cutoff: 900, cutoffKey: 1, peak: 0.12 });
      break;
    case "padGlass":
      subtractive(ctx, dest, p, [{ type: "sine" }, { type: "sine", ratio: 2, gain: 0.4 }, { type: "sine", ratio: 3.01, gain: 0.2 }], { a: 0.8, d: 0.4, s: 0.85, r: 1.5, peak: 0.14 });
      break;
    case "padChoir": {
      // sawtooth through "ah" formants
      const t = p.time;
      const stop = t + p.dur + 1.2;
      const amp = ctx.createGain();
      env(amp.gain, t, p.dur, 0.5, 0.3, 0.9, 1.0, 0.4 * p.vel);
      for (const [ff, fg, fq] of [[700, 1, 9], [1150, 0.5, 11], [2700, 0.18, 12]] as const) {
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = ff;
        f.Q.value = fq;
        const g = ctx.createGain();
        g.gain.value = fg;
        osc(ctx, "sawtooth", p.freq, t, stop, -6).connect(f);
        osc(ctx, "sawtooth", p.freq, t, stop, 6).connect(f);
        f.connect(g);
        g.connect(amp);
      }
      amp.connect(dest);
      break;
    }
    case "leadSaw":
      subtractive(ctx, dest, p, [{ type: "sawtooth", detune: -7 }, { type: "sawtooth", detune: 7 }, { type: "sawtooth" }], { a: 0.01, d: 0.1, s: 0.8, r: 0.15, cutoff: 2200, cutoffKey: 2, filterEnv: 1500, filterDecay: 0.15, peak: 0.16 });
      break;
    case "leadSquare":
      subtractive(ctx, dest, p, [{ type: "square" }], { a: 0.008, d: 0.08, s: 0.7, r: 0.1, cutoff: 3000, cutoffKey: 2, peak: 0.16 });
      break;
    case "leadChip":
      subtractive(ctx, dest, p, [{ type: "square" }], { a: 0.002, d: 0.03, s: 0.8, r: 0.03, peak: 0.14 });
      break;
    case "leadPluck":
      subtractive(ctx, dest, p, [{ type: "sawtooth" }, { type: "square", gain: 0.4 }], { a: 0.003, d: 0.18, s: 0.1, r: 0.12, cutoff: 600, cutoffKey: 1, filterEnv: 3000, filterDecay: 0.12, peak: 0.3 });
      break;
    case "tanpura": {
      const t = p.time;
      const stop = t + p.dur + 0.5;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = p.freq * 4;
      f.Q.value = 2;
      const lfo = osc(ctx, "sine", 0.4, t, stop);
      const lfoG = ctx.createGain();
      lfoG.gain.value = p.freq * 2;
      lfo.connect(lfoG);
      lfoG.connect(f.frequency);
      const amp = ctx.createGain();
      env(amp.gain, t, p.dur, 0.4, 0.3, 0.9, 0.6, 0.2 * p.vel);
      osc(ctx, "sawtooth", p.freq, t, stop).connect(f);
      osc(ctx, "sawtooth", p.freq * 1.005, t, stop).connect(f);
      f.connect(amp);
      amp.connect(dest);
      break;
    }
    case "accordion":
      subtractive(ctx, dest, p, [{ type: "square", detune: -8 }, { type: "square", detune: 8 }, { type: "sawtooth", gain: 0.3 }], { a: 0.06, d: 0.1, s: 0.85, r: 0.12, cutoff: 2000, cutoffKey: 1.5, peak: 0.14 });
      break;
    case "harp":
      pluck(ctx, dest, p, { brightness: 3000, sustain: 0.96, peak: 0.4 });
      break;
    default:
      subtractive(ctx, dest, p, [{ type: "sawtooth" }], { peak: 0.2 });
  }
}

// ---- drums -----------------------------------------------------------------

export function playDrum(ctx: BaseAudioContext, dest: AudioNode, drum: DrumName, time: number, vel: number) {
  const noise = () => {
    const n = ctx.createBufferSource();
    n.buffer = getNoiseBuffer(ctx);
    n.start(time, Math.random());
    return n;
  };
  switch (drum) {
    case "kick": {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(160, time);
      o.frequency.exponentialRampToValueAtTime(45, time + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9 * vel, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
      o.connect(g);
      g.connect(dest);
      o.start(time);
      o.stop(time + 0.3);
      // click
      const n = noise();
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1200;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.25 * vel, time);
      ng.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
      n.connect(hp);
      hp.connect(ng);
      ng.connect(dest);
      n.stop(time + 0.03);
      break;
    }
    case "snare": {
      const n = noise();
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800;
      bp.Q.value = 0.8;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.5 * vel, time);
      ng.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
      n.connect(bp);
      bp.connect(ng);
      ng.connect(dest);
      n.stop(time + 0.2);
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(220, time);
      o.frequency.exponentialRampToValueAtTime(150, time + 0.08);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.35 * vel, time);
      og.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
      o.connect(og);
      og.connect(dest);
      o.start(time);
      o.stop(time + 0.12);
      break;
    }
    case "hatClosed":
    case "hatOpen": {
      const open = drum === "hatOpen";
      const n = noise();
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.2 * vel, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + (open ? 0.35 : 0.045));
      n.connect(hp);
      hp.connect(g);
      g.connect(dest);
      n.stop(time + (open ? 0.4 : 0.06));
      break;
    }
    case "clap": {
      for (let i = 0; i < 3; i++) {
        const t = time + i * 0.012;
        const n = ctx.createBufferSource();
        n.buffer = getNoiseBuffer(ctx);
        n.start(t, Math.random());
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1200;
        bp.Q.value = 1.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.35 * vel, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        n.connect(bp);
        bp.connect(g);
        g.connect(dest);
        n.stop(t + 0.12);
      }
      break;
    }
    case "ride": {
      const n = noise();
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 5000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.14 * vel, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
      n.connect(hp);
      hp.connect(g);
      g.connect(dest);
      n.stop(time + 0.55);
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = 5300;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.03 * vel, time);
      og.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
      o.connect(og);
      og.connect(dest);
      o.start(time);
      o.stop(time + 0.35);
      break;
    }
    case "crash": {
      const n = noise();
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 3800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.3 * vel, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 1.4);
      n.connect(hp);
      hp.connect(g);
      g.connect(dest);
      n.stop(time + 1.5);
      break;
    }
    case "perc": {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(820, time);
      o.frequency.exponentialRampToValueAtTime(540, time + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.3 * vel, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.09);
      o.connect(g);
      g.connect(dest);
      o.start(time);
      o.stop(time + 0.1);
      break;
    }
  }
}

export type { NoteParams, Stopper };
