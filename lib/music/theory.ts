// Music theory primitives: scales, modes, chords, progressions, voice leading.

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export type ScaleName =
  | "major"
  | "naturalMinor"
  | "harmonicMinor"
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian"
  | "majorPentatonic"
  | "minorPentatonic"
  | "blues"
  | "phrygianDominant" // flamenco / middle-eastern
  | "doubleHarmonic" // byzantine / arabic maqam-like
  | "hirajoshi" // japanese
  | "inSen" // japanese
  | "ragaBhairav" // hindustani flavor
  | "slendro" // gamelan-approx (5-tone near-equidistant)
  | "pelog" // gamelan-approx
  | "wholeTone";

export const SCALES: Record<ScaleName, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
  doubleHarmonic: [0, 1, 4, 5, 7, 8, 11],
  hirajoshi: [0, 2, 3, 7, 8],
  inSen: [0, 1, 5, 7, 10],
  ragaBhairav: [0, 1, 4, 5, 7, 8, 11],
  slendro: [0, 2, 5, 7, 9],
  pelog: [0, 1, 3, 7, 8],
  wholeTone: [0, 2, 4, 6, 8, 10],
};

export function isMinorish(scale: ScaleName): boolean {
  return SCALES[scale].includes(3) && !SCALES[scale].includes(4);
}

/** Scale degree (0-based, can exceed octave / be negative) → midi note. */
export function degreeToMidi(root: number, scale: ScaleName, degree: number, octave = 0): number {
  const pcs = SCALES[scale];
  const n = pcs.length;
  const oct = Math.floor(degree / n) + octave;
  const idx = ((degree % n) + n) % n;
  return root + pcs[idx] + oct * 12;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

// ---- Chords -------------------------------------------------------------

export interface Chord {
  /** scale degree of the root (0-based) */
  degree: number;
  /** midi pitches, voiced */
  pitches: number[];
  /** root midi */
  rootMidi: number;
}

/**
 * Build a diatonic chord on a scale degree by stacking thirds (every other
 * scale step), so quality follows the scale automatically.
 */
export function diatonicChord(
  root: number,
  scale: ScaleName,
  degree: number,
  size = 3,
  octave = 0
): Chord {
  const pitches: number[] = [];
  for (let i = 0; i < size; i++) pitches.push(degreeToMidi(root, scale, degree + i * 2, octave));
  return { degree, pitches, rootMidi: pitches[0] };
}

/** Keep chord voicings near a center pitch for smooth voice leading. */
export function voiceLead(chord: Chord, center: number): Chord {
  const pitches = chord.pitches.map((p) => {
    let q = p;
    while (q < center - 6) q += 12;
    while (q > center + 6) q -= 12;
    return q;
  });
  pitches.sort((a, b) => a - b);
  return { ...chord, pitches };
}

/** Common progressions expressed as scale degrees (0-based). */
export const PROGRESSIONS: Record<string, number[][]> = {
  pop: [
    [0, 4, 5, 3],
    [0, 5, 3, 4],
    [5, 3, 0, 4],
    [0, 3, 4, 4],
    [0, 4, 3, 4],
  ],
  epic: [
    [5, 3, 0, 4],
    [0, 6, 3, 4],
    [5, 4, 3, 4],
  ],
  jazz: [
    [1, 4, 0, 0], // ii V I
    [1, 4, 0, 5],
    [3, 6, 2, 5], // cycle
    [0, 5, 1, 4],
  ],
  blues12: [
    [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4], // 12-bar
  ],
  folk: [
    [0, 3, 0, 4],
    [0, 4, 0, 4],
    [0, 3, 4, 0],
  ],
  modalDrone: [
    [0, 0, 0, 0],
    [0, 0, 6, 0],
    [0, 6, 0, 0],
  ],
  andalusian: [
    [0, 6, 5, 4], // i bVII bVI V feel in phrygian-ish contexts
  ],
  baroque: [
    [0, 4, 5, 2, 3, 0, 3, 4], // circle-of-fifths-ish
    [0, 3, 4, 0],
    [0, 4, 0, 4],
  ],
  doowop: [[0, 5, 3, 4]],
  minorPop: [
    [0, 5, 2, 6],
    [0, 3, 6, 4],
    [0, 6, 5, 6],
  ],
};

// ---- Rhythm -------------------------------------------------------------

/** A drum pattern: 16 steps per bar, velocity 0..1 (0 = silent). */
export interface DrumPattern {
  kick: number[];
  snare: number[];
  hatClosed: number[];
  hatOpen?: number[];
  perc?: number[]; // genre percussion (claves, shaker, tabla-ish, etc.)
  ride?: number[];
  clap?: number[];
  swing?: number; // 0..0.6 amount of swing on offbeat 16ths
}

const X = 1.0, x = 0.7, o = 0.45, _ = 0;

export const DRUM_PATTERNS: Record<string, DrumPattern> = {
  fourFloor: {
    kick: [X, _, _, _, X, _, _, _, X, _, _, _, X, _, _, _],
    snare: [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
    hatClosed: [_, _, x, _, _, _, x, _, _, _, x, _, _, _, x, _],
    hatOpen: [_, _, o, _, _, _, o, _, _, _, o, _, _, _, o, _],
  },
  backbeat: {
    kick: [X, _, _, _, _, _, _, _, X, _, x, _, _, _, _, _],
    snare: [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
    hatClosed: [x, _, x, _, x, _, x, _, x, _, x, _, x, _, x, _],
  },
  halftime: {
    kick: [X, _, _, _, _, _, _, _, _, _, x, _, _, _, _, _],
    snare: [_, _, _, _, _, _, _, _, X, _, _, _, _, _, _, _],
    hatClosed: [x, _, x, _, x, _, x, _, x, _, x, _, x, _, x, _],
  },
  trap: {
    kick: [X, _, _, _, _, _, _, x, _, _, X, _, _, _, _, _],
    snare: [_, _, _, _, _, _, _, _, X, _, _, _, _, _, _, _],
    hatClosed: [x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x],
    swing: 0,
  },
  boomBap: {
    kick: [X, _, _, _, _, _, x, _, _, _, X, _, _, x, _, _],
    snare: [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
    hatClosed: [x, _, x, _, x, _, x, _, x, _, x, _, x, _, x, _],
    swing: 0.25,
  },
  breakbeat: {
    kick: [X, _, _, _, _, _, x, _, _, x, _, _, _, _, _, _],
    snare: [_, _, _, _, X, _, _, x, _, _, x, _, X, _, _, x],
    hatClosed: [x, _, x, _, x, _, x, _, x, _, x, _, x, _, x, _],
  },
  reggaeOneDrop: {
    kick: [_, _, _, _, _, _, _, _, X, _, _, _, _, _, _, _],
    snare: [_, _, _, _, _, _, _, _, X, _, _, _, _, _, _, _],
    hatClosed: [x, _, x, _, x, x, x, _, x, _, x, _, x, x, x, _],
    perc: [_, _, _, _, x, _, _, _, _, _, _, _, x, _, _, _],
  },
  bossa: {
    kick: [X, _, _, x, _, _, X, _, X, _, _, x, _, _, X, _],
    snare: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    hatClosed: [x, _, x, _, x, _, x, _, x, _, x, _, x, _, x, _],
    perc: [x, _, _, x, _, _, x, _, _, _, x, _, _, x, _, _], // clave-ish
  },
  swingJazz: {
    kick: [o, _, _, _, _, _, _, _, o, _, _, _, _, _, _, _],
    snare: [_, _, _, _, o, _, _, o, _, _, _, _, o, _, _, _],
    hatClosed: [_, _, _, _, x, _, _, _, _, _, _, _, x, _, _, _],
    ride: [x, _, _, _, x, _, x, _, x, _, _, _, x, _, x, _],
    swing: 0.55,
  },
  waltz: {
    // 12 steps used as 3/4 (engine handles via stepsPerBar)
    kick: [X, _, _, _, _, _, _, _, _, _, _, _],
    snare: [_, _, _, _, x, _, _, _, x, _, _, _],
    hatClosed: [_, _, _, _, x, _, _, _, x, _, _, _],
  },
  afrobeat: {
    kick: [X, _, _, _, _, _, x, _, _, _, X, _, _, _, x, _],
    snare: [_, _, x, _, X, _, _, x, _, x, _, _, X, _, _, _],
    hatClosed: [x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x],
    perc: [X, _, _, x, _, x, _, _, X, _, x, _, _, x, _, _], // bell
  },
  dembow: {
    kick: [X, _, _, X, _, _, X, _, X, _, _, X, _, _, X, _],
    snare: [_, _, _, X, _, _, X, _, _, _, _, X, _, _, X, _],
    hatClosed: [x, _, x, _, x, _, x, _, x, _, x, _, x, _, x, _],
  },
  tabla: {
    kick: [X, _, _, x, _, _, x, _, _, _, X, _, x, _, _, _], // dha/ge feel
    snare: [_, _, _, _, _, _, _, _, X, _, _, _, _, _, x, _], // tin/na feel
    hatClosed: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    perc: [_, x, _, _, x, _, _, x, _, x, _, _, x, _, _, x],
  },
  gamelan: {
    kick: [X, _, _, _, _, _, _, _, X, _, _, _, _, _, _, _], // gong
    snare: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    hatClosed: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    perc: [x, _, x, x, _, x, x, _, x, _, x, x, _, x, x, _],
  },
  march: {
    kick: [X, _, _, _, X, _, _, _, X, _, _, _, X, _, _, _],
    snare: [x, _, x, x, x, _, x, _, x, _, x, x, x, _, x, x],
    hatClosed: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  },
  none: {
    kick: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    snare: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    hatClosed: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  },
};

/** Melodic rhythm templates: note durations in 16th steps summing to 16 (one bar). */
export const MELODIC_RHYTHMS: number[][] = [
  [4, 4, 4, 4],
  [2, 2, 4, 2, 2, 4],
  [4, 2, 2, 4, 4],
  [2, 4, 2, 4, 4],
  [8, 4, 4],
  [4, 4, 8],
  [2, 2, 2, 2, 4, 4],
  [6, 2, 4, 4],
  [4, 6, 2, 4],
  [2, 2, 4, 4, 2, 2],
  [12, 4],
  [8, 8],
];
