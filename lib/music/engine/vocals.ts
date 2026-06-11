// Formant singer: a stylized synthesized voice that actually sings the
// lyrics' syllables — glottal-rich source, vowel formant filters, consonant
// noise onsets, vibrato, portamento. Deliberately synthetic-sounding (think
// vocoder/choir), honest about not being a human voice.

import { midiToFreq } from "../theory";
import type { Syllable, VoiceConfig } from "../types";
import { getNoiseBuffer } from "./synth";

type Vowel = "a" | "e" | "i" | "o" | "u" | "eu";

// Formant frequencies (F1, F2, F3) and gains for sung vowels.
const VOWELS: Record<Vowel, { f: [number, number, number]; g: [number, number, number] }> = {
  a: { f: [800, 1150, 2900], g: [1, 0.5, 0.2] },
  e: { f: [430, 2100, 2750], g: [1, 0.35, 0.18] },
  i: { f: [280, 2250, 3050], g: [1, 0.25, 0.18] },
  o: { f: [430, 850, 2650], g: [1, 0.45, 0.12] },
  u: { f: [320, 750, 2500], g: [1, 0.35, 0.1] },
  eu: { f: [500, 1500, 2700], g: [1, 0.4, 0.15] },
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

export interface SingOptions {
  choir?: boolean;
  prevMidi?: number | null;
}

/**
 * Schedule one sung syllable. `time`/`dur` in seconds on the context clock.
 */
export function singSyllable(
  ctx: BaseAudioContext,
  dest: AudioNode,
  syl: Syllable,
  time: number,
  dur: number,
  voice: VoiceConfig,
  opts: SingOptions = {}
) {
  const freq = midiToFreq(syl.midi);
  const vowel = VOWELS[vowelOf(syl.text)];
  const formantShift =
    (voice.gender === "feminine" ? 1.12 : voice.gender === "masculine" ? 0.9 : voice.gender === "ethereal" ? 1.2 : 1) *
    (0.92 + voice.brightness * 0.18);

  const stop = time + dur + 0.25;
  const amp = ctx.createGain();
  const peak = 0.5 * syl.vel;
  amp.gain.setValueAtTime(0.0001, time);
  amp.gain.exponentialRampToValueAtTime(peak, time + 0.04);
  amp.gain.setValueAtTime(peak, Math.max(time + 0.04, time + dur - 0.06));
  amp.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.08);
  amp.connect(dest);

  const voices = opts.choir ? [-10, 0, 10] : [0];
  for (const det of voices) {
    // Glottal source with portamento + vibrato.
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    const from = opts.prevMidi != null ? midiToFreq(opts.prevMidi) : freq * 0.985;
    o.frequency.setValueAtTime(from, time);
    o.frequency.exponentialRampToValueAtTime(freq, time + 0.05);
    o.detune.setValueAtTime(det, time);
    o.start(time);
    o.stop(stop);

    // Vibrato fades in after the onset.
    const vib = ctx.createOscillator();
    vib.frequency.value = voice.vibratoHz;
    const vibG = ctx.createGain();
    vibG.gain.setValueAtTime(0, time);
    vibG.gain.linearRampToValueAtTime(freq * (Math.pow(2, voice.vibratoDepth / 12) - 1), time + Math.min(0.25, dur * 0.5));
    vib.connect(vibG);
    vibG.connect(o.frequency);
    vib.start(time);
    vib.stop(stop);

    // Breath noise mixed with the source.
    const breath = ctx.createBufferSource();
    breath.buffer = getNoiseBuffer(ctx);
    breath.start(time, Math.random(), dur + 0.2);
    const breathG = ctx.createGain();
    breathG.gain.value = 0.04 + voice.breathiness * 0.12;

    // Vowel formant bank.
    for (let i = 0; i < 3; i++) {
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = vowel.f[i] * formantShift;
      f.Q.value = i === 0 ? 8 : 11;
      const g = ctx.createGain();
      g.gain.value = vowel.g[i] / voices.length;
      o.connect(f);
      breath.connect(breathG);
      breathG.connect(f);
      f.connect(g);
      g.connect(amp);
    }
  }

  // Consonant onset.
  const cons = consonantOf(syl.text);
  if (cons !== "none" && cons !== "soft") {
    const n = ctx.createBufferSource();
    n.buffer = getNoiseBuffer(ctx);
    const cdur = cons === "s" || cons === "sh" || cons === "f" ? 0.07 : 0.025;
    n.start(time - 0.02 < 0 ? 0 : time - 0.02, Math.random(), cdur);
    const f = ctx.createBiquadFilter();
    f.type = cons === "t" || cons === "k" ? "bandpass" : "highpass";
    f.frequency.value = cons === "s" ? 6000 : cons === "sh" ? 3000 : cons === "f" ? 4500 : cons === "k" ? 1500 : 3500;
    f.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18 * syl.vel, Math.max(0, time - 0.02));
    g.gain.exponentialRampToValueAtTime(0.001, time + cdur);
    n.connect(f);
    f.connect(g);
    g.connect(amp);
  }
}
