// Formant singer, legato edition: each lyric line is one continuous phonation
// — a single glottal source whose pitch glides between syllables, with vowel
// formants morphing along the line. A sine layer doubles the fundamental so
// the pitch always reads clearly. Deliberately synthetic, but musical.

import { midiToFreq } from "../theory";
import type { Syllable, VoiceConfig } from "../types";
import { getNoiseBuffer } from "./synth";

type Vowel = "a" | "e" | "i" | "o" | "u" | "eu";

const VOWELS: Record<Vowel, { f: [number, number, number]; g: [number, number, number] }> = {
  a: { f: [800, 1150, 2900], g: [1, 0.5, 0.16] },
  e: { f: [430, 2100, 2750], g: [1, 0.3, 0.14] },
  i: { f: [280, 2250, 3050], g: [1, 0.22, 0.14] },
  o: { f: [430, 850, 2650], g: [1, 0.45, 0.1] },
  u: { f: [320, 750, 2500], g: [1, 0.35, 0.08] },
  eu: { f: [500, 1500, 2700], g: [1, 0.38, 0.12] },
};

function vowelOf(syllable: string): Vowel {
  const s = syllable.toLowerCase();
  if (/ou|oo/.test(s)) return "u";
  if (/eau|au|ô|o/.test(s)) return "o";
  if (/eu|œ/.test(s)) return "eu";
  if (/[iïî]|y/.test(s)) return "i";
  if (/[éèêëe]/.test(s)) return "e";
  if (/[aàâ]/.test(s)) return "a";
  return "a";
}

type Consonant = "none" | "s" | "sh" | "t" | "k" | "f" | "soft";

function consonantOf(syllable: string): Consonant {
  const c = syllable.toLowerCase().match(/^[^aeiouyàâéèêëîïôûù]+/)?.[0] ?? "";
  if (!c) return "none";
  if (/^(s|c|z)/.test(c)) return "s";
  if (/^(ch|j|sh)/.test(c)) return "sh";
  if (/^(t|d)/.test(c)) return "t";
  if (/^(k|q|g)/.test(c)) return "k";
  if (/^(f|v|p|b)/.test(c)) return "f";
  return "soft";
}

export interface TimedSyllable {
  syl: Syllable;
  time: number; // seconds
  dur: number; // seconds
}

export interface SingOptions {
  choir?: boolean;
}

/** Sing one lyric line as a single continuous, gliding phonation. */
export function singLine(
  ctx: BaseAudioContext,
  dest: AudioNode,
  sylls: TimedSyllable[],
  voice: VoiceConfig,
  opts: SingOptions = {}
) {
  if (!sylls.length) return;
  const start = sylls[0].time;
  const last = sylls[sylls.length - 1];
  const end = last.time + last.dur;
  const stop = end + 0.3;

  const formantShift =
    (voice.gender === "feminine" ? 1.12 : voice.gender === "masculine" ? 0.9 : voice.gender === "ethereal" ? 1.2 : 1) *
    (0.92 + voice.brightness * 0.18);

  const avgVel = sylls.reduce((s, x) => s + x.syl.vel, 0) / sylls.length;
  const peak = 0.45 * avgVel;

  // Line-level amplitude envelope with gentle re-articulation per syllable.
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, start - 0.04 < 0 ? 0 : start - 0.04);
  amp.gain.exponentialRampToValueAtTime(peak, start + 0.06);
  for (let i = 1; i < sylls.length; i++) {
    const t = sylls[i].time;
    amp.gain.setValueAtTime(peak, Math.max(start + 0.06, t - 0.05));
    amp.gain.linearRampToValueAtTime(peak * 0.72, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.05);
  }
  amp.gain.setValueAtTime(peak, Math.max(start + 0.06, end - 0.08));
  amp.gain.exponentialRampToValueAtTime(0.0001, end + 0.12);
  amp.connect(dest);

  // Shared vibrato, fading in.
  const vib = ctx.createOscillator();
  vib.frequency.value = voice.vibratoHz;
  const vibG = ctx.createGain();
  vibG.gain.setValueAtTime(0, start);
  vibG.gain.linearRampToValueAtTime(0, start + 0.18);
  vib.start(start);
  vib.stop(stop);
  vib.connect(vibG);

  // Formant bank (one per line, morphing per syllable).
  const formants: { f: BiquadFilterNode; g: GainNode }[] = [];
  for (let i = 0; i < 3; i++) {
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = i === 0 ? 7 : 10;
    const g = ctx.createGain();
    f.connect(g);
    g.connect(amp);
    formants.push({ f, g });
  }

  // Glottal sources: rich saw(s) through the formants…
  const detunes = opts.choir ? [-9, 0, 9] : [0];
  const sources: OscillatorNode[] = [];
  for (const det of detunes) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.detune.setValueAtTime(det, start);
    o.start(start);
    o.stop(stop);
    vibG.connect(o.frequency);
    for (const { f } of formants) o.connect(f);
    sources.push(o);
  }
  // …plus a sine on the fundamental so the pitch reads clearly.
  const fund = ctx.createOscillator();
  fund.type = "sine";
  fund.start(start);
  fund.stop(stop);
  vibG.connect(fund.frequency);
  const fundG = ctx.createGain();
  fundG.gain.value = 0.55 / detunes.length;
  fund.connect(fundG);
  fundG.connect(amp);

  // Soft breath through the formants.
  const breath = ctx.createBufferSource();
  breath.buffer = getNoiseBuffer(ctx);
  breath.loop = true;
  breath.start(start, Math.random());
  breath.stop(stop);
  const breathG = ctx.createGain();
  breathG.gain.value = 0.02 + voice.breathiness * 0.06;
  breath.connect(breathG);
  for (const { f } of formants) breathG.connect(f);

  // Schedule pitch glides, vowel morphs and consonant onsets.
  let vibTarget = 0;
  for (let i = 0; i < sylls.length; i++) {
    const { syl, time, dur } = sylls[i];
    const freq = midiToFreq(syl.midi);
    const vowel = VOWELS[vowelOf(syl.text)];

    for (const o of [...sources, fund]) {
      if (i === 0) o.frequency.setValueAtTime(freq * 0.99, start - 0.04 < 0 ? 0 : start - 0.04);
      o.frequency.setTargetAtTime(freq, Math.max(0, time - 0.03), 0.022);
    }
    for (let k = 0; k < 3; k++) {
      const { f, g } = formants[k];
      const ff = vowel.f[k] * formantShift;
      const gg = (vowel.g[k] / detunes.length) * 0.9;
      if (i === 0) {
        f.frequency.setValueAtTime(ff, Math.max(0, start - 0.04));
        g.gain.setValueAtTime(gg, Math.max(0, start - 0.04));
      } else {
        f.frequency.setTargetAtTime(ff, time - 0.02, 0.03);
        g.gain.setTargetAtTime(gg, time - 0.02, 0.03);
      }
    }

    // Vibrato depth follows the current pitch (fades in per line).
    vibTarget = freq * (Math.pow(2, voice.vibratoDepth / 12) - 1);
    vibG.gain.setTargetAtTime(vibTarget, time + Math.min(0.2, dur * 0.4), 0.08);

    // Consonant onset: short, quiet noise burst.
    const cons = consonantOf(syl.text);
    if (cons !== "none" && cons !== "soft") {
      const n = ctx.createBufferSource();
      n.buffer = getNoiseBuffer(ctx);
      const cdur = cons === "s" || cons === "sh" || cons === "f" ? 0.055 : 0.02;
      const ct = Math.max(0, time - 0.025);
      n.start(ct, Math.random(), cdur);
      const f = ctx.createBiquadFilter();
      f.type = cons === "t" || cons === "k" ? "bandpass" : "highpass";
      f.frequency.value = cons === "s" ? 6000 : cons === "sh" ? 3000 : cons === "f" ? 4500 : cons === "k" ? 1500 : 3500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.09 * syl.vel, ct);
      g.gain.exponentialRampToValueAtTime(0.001, ct + cdur + 0.01);
      n.connect(f);
      f.connect(g);
      g.connect(dest);
    }
  }
}

/** One-syllable convenience (previews). */
export function singSyllable(
  ctx: BaseAudioContext,
  dest: AudioNode,
  syl: Syllable,
  time: number,
  dur: number,
  voice: VoiceConfig,
  opts: SingOptions & { prevMidi?: number | null } = {}
) {
  singLine(ctx, dest, [{ syl, time, dur }], voice, opts);
}
