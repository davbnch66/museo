// Voice analysis (pitch detection on a user recording) and the parametric
// voice designer that invents original voices.

import type { RNG } from "../music/rng";
import { makeRNG } from "../music/rng";
import type { VoiceConfig } from "../music/types";

/** Median fundamental frequency of a recording, via autocorrelation. */
export async function detectBasePitch(blob: Blob): Promise<number | null> {
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = buf.getChannelData(0);
    const sr = buf.sampleRate;
    const frame = 2048;
    const hop = 1024;
    const pitches: number[] = [];
    for (let start = 0; start + frame < data.length; start += hop) {
      const f = autocorrelate(data.subarray(start, start + frame), sr);
      if (f > 70 && f < 500) pitches.push(f);
    }
    if (pitches.length < 5) return null;
    pitches.sort((a, b) => a - b);
    return pitches[Math.floor(pitches.length / 2)];
  } finally {
    void ctx.close();
  }
}

function autocorrelate(buf: Float32Array, sampleRate: number): number {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.01) return -1;

  const maxLag = Math.floor(sampleRate / 70);
  const minLag = Math.floor(sampleRate / 500);
  let bestLag = -1;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < buf.length - lag; i++) corr += buf[i] * buf[i + lag];
    corr /= buf.length - lag;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  if (bestLag === -1 || bestCorr < 0.001) return -1;
  return sampleRate / bestLag;
}

export function freqToMidi(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

// ---- voice designer ---------------------------------------------------------

const VOICE_NAMES = [
  "Aria", "Nox", "Séléné", "Orfeo", "Lyra", "Cassiel", "Vesper", "Ondine",
  "Phaedra", "Ilios", "Mirage", "Brume", "Saphir", "Échо", "Astrée", "Velours",
  "Cendre", "Aube", "Zéphyr", "Opale",
];

const GENDERS: VoiceConfig["gender"][] = ["feminine", "masculine", "neutral", "ethereal"];

/** Invent an original voice. Deterministic from the seed. */
export function designVoice(seed?: number): VoiceConfig {
  const rng: RNG = makeRNG(seed ?? Math.floor(Math.random() * 2 ** 31));
  const gender = rng.pick(GENDERS);
  const baseMidi =
    gender === "feminine" ? rng.int(64, 71) : gender === "masculine" ? rng.int(52, 60) : gender === "ethereal" ? rng.int(67, 74) : rng.int(58, 66);
  return {
    voiceId: `designed_${Date.now().toString(36)}_${rng.int(100, 999)}`,
    name: `${rng.pick(VOICE_NAMES)} ${rng.int(1, 99)}`,
    baseMidi,
    brightness: 0.25 + rng.next() * 0.7,
    breathiness: rng.next() * 0.6,
    vibratoHz: 4 + rng.next() * 2.6,
    vibratoDepth: 0.15 + rng.next() * 0.55,
    gender,
    source: "designed",
  };
}
