// The composer: prompt → fully arranged Song (sections, chords, bass, melody,
// vocal lines mapped to lyrics, drums), deterministic from a seed.

import { GenreDef, SectionType, getGenre, matchGenre, STRUCTURES } from "./genres";
import {
  Chord,
  DRUM_PATTERNS,
  MELODIC_RHYTHMS,
  PROGRESSIONS,
  ScaleName,
  degreeToMidi,
  diatonicChord,
  isMinorish,
  voiceLead,
} from "./theory";
import { analyzePrompt } from "./prompt";
import { generateLyrics, syllabify } from "./lyrics";
import { RNG, hashString, makeRNG } from "./rng";
import {
  DEFAULT_VOICE,
  DrumEvent,
  NoteEvent,
  Section,
  Song,
  Track,
  VocalLine,
  VoiceConfig,
} from "./types";

const SECTION_ENERGY: Record<SectionType, number> = {
  intro: 0.45,
  verse: 0.6,
  prechorus: 0.72,
  chorus: 1,
  drop: 1,
  bridge: 0.55,
  breakdown: 0.4,
  solo: 0.85,
  outro: 0.4,
};

export interface ComposeOptions {
  prompt: string;
  genreId?: string;
  seed?: number;
  voice?: VoiceConfig | null;
  instrumental?: boolean;
  customLyrics?: string | null;
}

export function composeSong(opts: ComposeOptions): Song {
  const seed = opts.seed ?? (hashString(opts.prompt) ^ (Date.now() & 0xffff)) >>> 0;
  const rng = makeRNG(seed);

  const genre: GenreDef = opts.genreId ? getGenre(opts.genreId) : matchGenre(opts.prompt).genre;
  const analysis = analyzePrompt(opts.prompt, genre.hue, genre.energy, seed);
  const { mood } = analysis;

  // --- Key, tempo, meter ---
  const minorish = genre.scales.filter((s) => isMinorish(s));
  const majorish = genre.scales.filter((s) => !isMinorish(s));
  let scale: ScaleName;
  if (mood.valence < -0.15 && minorish.length) scale = rng.pick(minorish);
  else if (mood.valence > 0.25 && majorish.length) scale = rng.pick(majorish);
  else scale = rng.pick(genre.scales);

  const bpm =
    analysis.bpmHint ??
    Math.round(genre.bpm[0] + (genre.bpm[1] - genre.bpm[0]) * (0.3 + 0.7 * mood.energy * rng.next()));
  const stepsPerBar = genre.stepsPerBar ?? 16;
  const rootMidi = rng.int(45, 56); // A2..G#3 region for harmony center

  // --- Structure ---
  const structName = rng.pick(genre.structures);
  const template = STRUCTURES[structName];
  const stepDur = 60 / bpm / 4;
  // Trim long structures for very slow tempi so songs stay ~2-3 minutes.
  let sectionsTemplate = template;
  const estimate = (t: typeof template) => t.reduce((s, x) => s + x.bars, 0) * stepsPerBar * stepDur;
  if (estimate(template) > 210) {
    sectionsTemplate = template.map((s) => ({ ...s, bars: Math.max(4, Math.round(s.bars / 2)) }));
  }

  const instrumental = opts.instrumental ?? (analysis.wantsInstrumental || genre.vocalStyle === "none");
  const voice = instrumental ? null : opts.voice ?? DEFAULT_VOICE;

  // --- Lyrics ---
  const lyricPlan = instrumental
    ? { sections: sectionsTemplate.map((s) => ({ type: s.type, lines: [] as string[] })), hook: "" }
    : opts.customLyrics
      ? planFromCustomLyrics(opts.customLyrics, sectionsTemplate)
      : generateLyrics(rng, mood.themes, analysis.title, sectionsTemplate, analysis.language);

  // --- Harmony: chord per bar, distinct progressions for verse vs chorus ---
  const progPool = genre.progressions.flatMap((p) => PROGRESSIONS[p]);
  const verseProg = rng.pick(progPool);
  const chorusProg = rng.pick(progPool.filter((p) => p !== verseProg).length ? progPool.filter((p) => p !== verseProg) : progPool);
  const bridgeProg = rng.pick(progPool);
  const progFor = (t: SectionType) =>
    t === "chorus" || t === "drop" ? chorusProg : t === "bridge" || t === "breakdown" ? bridgeProg : verseProg;

  // --- Lay out sections on the global step grid ---
  const sections: Section[] = [];
  let cursor = 0;
  for (const s of sectionsTemplate) {
    const startStep = cursor;
    const endStep = cursor + s.bars * stepsPerBar;
    sections.push({ type: s.type, bars: s.bars, startStep, endStep, energy: SECTION_ENERGY[s.type], lyricLines: [] });
    cursor = endStep;
  }
  const totalSteps = cursor;

  // Per-bar chord map for the whole song.
  const chordSize = genre.progressions.includes("jazz") ? 4 : 3;
  const chordAt: Chord[] = [];
  for (const sec of sections) {
    const prog = progFor(sec.type);
    for (let b = 0; b < sec.bars; b++) {
      const degree = prog[b % prog.length];
      const raw = diatonicChord(rootMidi, scale, degree, chordSize, 1);
      chordAt.push(voiceLead(raw, rootMidi + 16));
    }
  }
  const barOf = (step: number) => Math.floor(step / stepsPerBar);

  // --- Tracks ---
  const tracks: Track[] = [];
  const drums: DrumEvent[] = [];

  const pickInst = <T,>(arr: readonly T[] | undefined): T | null => (arr && arr.length ? rng.pick(arr) : null);
  const bassInst = pickInst(genre.instruments.bass);
  const chordInst = pickInst(genre.instruments.chords);
  const melodyInst = rng.pick(genre.instruments.melody);
  const padInst = pickInst(genre.instruments.pad);
  const arpInst = pickInst(genre.instruments.arp);
  const droneInst = pickInst(genre.instruments.drone);
  const usePad = padInst && rng.chance(genre.padChance ?? 0);
  const useArp = arpInst && rng.chance(genre.arpChance ?? 0);
  const chordStyle = rng.pick(genre.chordStyle);
  const bassStyle = rng.pick(genre.bassStyle);

  const bassNotes: NoteEvent[] = [];
  const chordNotes: NoteEvent[] = [];
  const padNotes: NoteEvent[] = [];
  const arpNotes: NoteEvent[] = [];
  const droneNotes: NoteEvent[] = [];
  const melodyNotes: NoteEvent[] = [];
  const vocalNotes: NoteEvent[] = [];

  // Melodic motifs (2 bars each) shared across like sections for coherence.
  const motifVerse = makeMotif(rng, stepsPerBar);
  const motifChorus = makeMotif(rng, stepsPerBar, true);

  for (const sec of sections) {
    const e = sec.energy;
    const lyricSec = lyricPlan.sections[sections.indexOf(sec)];

    for (let b = 0; b < sec.bars; b++) {
      const barStart = sec.startStep + b * stepsPerBar;
      const chord = chordAt[barOf(barStart)];
      const nextChord = chordAt[Math.min(barOf(barStart) + 1, chordAt.length - 1)];
      const lastBarOfFour = (b + 1) % 4 === 0;

      // Bass
      if (bassInst && e >= 0.42) {
        addBassBar(bassNotes, rng, bassStyle, chord, nextChord, barStart, stepsPerBar, e, rootMidi, scale);
      }
      // Chords
      if (chordInst) {
        addChordBar(chordNotes, rng, chordStyle, chord, barStart, stepsPerBar, e);
      }
      // Pad
      if (usePad && padInst && (e <= 0.95 || sec.type === "chorus" || sec.type === "drop")) {
        for (const p of chord.pitches) padNotes.push({ step: barStart, durSteps: stepsPerBar, midi: p + 12, vel: 0.5 });
      }
      // Drone
      if (droneInst) {
        if (b === 0) {
          droneNotes.push({ step: barStart, durSteps: sec.bars * stepsPerBar, midi: rootMidi, vel: 0.6 });
          droneNotes.push({ step: barStart, durSteps: sec.bars * stepsPerBar, midi: rootMidi + 7, vel: 0.4 });
        }
      }
      // Arp
      if (useArp && arpInst && e >= 0.5) {
        addArpBar(arpNotes, chord, barStart, stepsPerBar, e, rng);
      }
      // Drums
      if (genre.drums[0] !== "none") {
        addDrumBar(drums, rng, genre, barStart, stepsPerBar, sec, b, lastBarOfFour);
      }
    }

    // Melody / vocals per section
    const hasLyrics = !!lyricSec && lyricSec.lines.length > 0 && !!voice;
    const wantsInstMelody =
      !hasLyrics ||
      sec.type === "intro" ||
      sec.type === "solo" ||
      sec.type === "outro" ||
      sec.type === "drop";

    if (hasLyrics) {
      const lines = lyricSec.lines;
      sec.lyricLines = layVocalLines(rng, lines, sec, stepsPerBar, chordAt, rootMidi, scale, voice!, vocalNotes);
    }
    if (wantsInstMelody && !(sec.type === "intro" && genre.id !== "chiptune" && rng.chance(0.4))) {
      const motif = sec.type === "chorus" || sec.type === "drop" ? motifChorus : motifVerse;
      addMelodySection(melodyNotes, rng, motif, sec, stepsPerBar, chordAt, rootMidi, scale, sec.type === "drop" && hasLyrics ? 0.5 : 0.85);
    }
  }

  if (bassInst && bassNotes.length) tracks.push({ id: "bass", role: "bass", instrument: bassInst, notes: bassNotes, gain: 0.85, pan: 0 });
  if (chordInst && chordNotes.length) tracks.push({ id: "chords", role: "chords", instrument: chordInst, notes: chordNotes, gain: 0.5, pan: -0.15 });
  if (usePad && padInst && padNotes.length) tracks.push({ id: "pad", role: "pad", instrument: padInst, notes: padNotes, gain: 0.33, pan: 0.1 });
  if (droneInst && droneNotes.length) tracks.push({ id: "drone", role: "drone", instrument: droneInst, notes: droneNotes, gain: 0.45, pan: 0 });
  if (useArp && arpInst && arpNotes.length) tracks.push({ id: "arp", role: "arp", instrument: arpInst, notes: arpNotes, gain: 0.4, pan: 0.3 });
  if (melodyNotes.length) tracks.push({ id: "melody", role: "melody", instrument: melodyInst, notes: melodyNotes, gain: 0.65, pan: 0.05 });
  if (vocalNotes.length) tracks.push({ id: "vocal", role: "vocal", instrument: "leadSaw", notes: vocalNotes, gain: 0.9, pan: 0 });

  const durationSec = totalSteps * stepDur + 3; // release tail

  return {
    id: `song_${seed.toString(36)}_${Date.now().toString(36)}`,
    title: analysis.title,
    prompt: opts.prompt,
    createdAt: Date.now(),
    seed,
    genreId: genre.id,
    genreName: genre.name,
    bpm,
    rootMidi,
    scale,
    swing: genre.swing ?? DRUM_PATTERNS[genre.drums[0]]?.swing ?? 0,
    stepsPerBar,
    sections,
    tracks,
    drums,
    lyrics: lyricPlan.sections.filter((s) => s.lines.length > 0),
    mood,
    voice,
    totalSteps,
    durationSec,
  };
}

// ---- helpers -------------------------------------------------------------

function planFromCustomLyrics(text: string, structure: { type: SectionType }[]) {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((b) => b.length);
  let i = 0;
  const sections = structure.map((s) => {
    if (["verse", "chorus", "bridge", "prechorus", "drop", "breakdown"].includes(s.type) && blocks.length) {
      const block = blocks[i % blocks.length];
      i++;
      return { type: s.type, lines: block };
    }
    return { type: s.type, lines: [] as string[] };
  });
  return { sections, hook: blocks[0]?.[0] ?? "" };
}

interface Motif {
  rhythm: number[]; // durations in steps, for 2 bars
  contour: number[]; // scale-degree offsets from chord root
}

function makeMotif(rng: RNG, stepsPerBar: number, brighter = false): Motif {
  const scaleFactor = stepsPerBar / 16;
  const r1 = rng.pick(MELODIC_RHYTHMS).map((d) => Math.max(1, Math.round(d * scaleFactor)));
  const r2 = rng.pick(MELODIC_RHYTHMS).map((d) => Math.max(1, Math.round(d * scaleFactor)));
  const rhythm = [...r1, ...r2];
  const contour: number[] = [];
  let cur = brighter ? 4 : 2; // chord-relative degree
  for (let i = 0; i < rhythm.length; i++) {
    contour.push(cur);
    const move = rng.pickWeighted([
      { value: -2, w: 1 },
      { value: -1, w: 3 },
      { value: 0, w: 1.5 },
      { value: 1, w: 3 },
      { value: 2, w: 1.5 },
      { value: 3, w: 0.6 },
    ]);
    cur = Math.max(brighter ? 2 : 0, Math.min(brighter ? 8 : 6, cur + move));
  }
  // End phrases on a stable tone.
  contour[contour.length - 1] = brighter ? 4 : 2;
  return { rhythm, contour };
}

function nearestDegreeIndex(root: number, scale: ScaleName, midi: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let d = -14; d <= 28; d++) {
    const m = degreeToMidi(root, scale, d);
    const dist = Math.abs(m - midi);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

function addMelodySection(
  out: NoteEvent[],
  rng: RNG,
  motif: Motif,
  sec: Section,
  stepsPerBar: number,
  chordAt: Chord[],
  root: number,
  scale: ScaleName,
  velScale: number
) {
  const phraseSteps = stepsPerBar * 2;
  const phrases = Math.floor((sec.bars * stepsPerBar) / phraseSteps);
  for (let ph = 0; ph < phrases; ph++) {
    const phraseStart = sec.startStep + ph * phraseSteps;
    let step = phraseStart;
    const mutate = ph > 0 && rng.chance(0.5);
    for (let i = 0; i < motif.rhythm.length && step < phraseStart + phraseSteps; i++) {
      const dur = motif.rhythm[i];
      const chord = chordAt[Math.floor(step / stepsPerBar)] ?? chordAt[chordAt.length - 1];
      let degOffset = motif.contour[i];
      if (mutate && rng.chance(0.25)) degOffset += rng.pick([-1, 1]);
      const chordRootDeg = nearestDegreeIndex(root, scale, chord.rootMidi);
      let midi = degreeToMidi(root, scale, chordRootDeg + degOffset, 2);
      // Snap strong beats to chord tones.
      if ((step - phraseStart) % (stepsPerBar / 2) === 0) {
        midi = snapToChordTone(midi, chord);
      }
      if (rng.chance(0.92)) {
        out.push({ step, durSteps: Math.max(1, dur - (rng.chance(0.3) ? 1 : 0)), midi, vel: velScale * (0.75 + 0.25 * rng.next()) });
      }
      step += dur;
    }
  }
}

function snapToChordTone(midi: number, chord: Chord): number {
  let best = midi;
  let bestDist = Infinity;
  for (const p of chord.pitches) {
    for (const oct of [-12, 0, 12, 24]) {
      const c = p + oct;
      const d = Math.abs(c - midi);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
  }
  return best;
}

/** Vocal rhythm archetypes for a 2-bar phrase, scaled to syllable count. */
function layVocalLines(
  rng: RNG,
  lines: string[],
  sec: Section,
  stepsPerBar: number,
  chordAt: Chord[],
  root: number,
  scale: ScaleName,
  voice: VoiceConfig,
  vocalNotes: NoteEvent[]
): VocalLine[] {
  const phraseSteps = stepsPerBar * 2;
  const phrases = Math.max(1, Math.floor((sec.bars * stepsPerBar) / phraseSteps));
  const out: VocalLine[] = [];
  const isChorus = sec.type === "chorus" || sec.type === "drop";
  const centerDeg = nearestDegreeIndex(root, scale, voice.baseMidi) + (isChorus ? 2 : 0);

  for (let ph = 0; ph < phrases; ph++) {
    const line = lines[ph % lines.length];
    const sylls = syllabify(line);
    const phraseStart = sec.startStep + ph * phraseSteps;
    const n = sylls.length;

    // Distribute n syllables over ~1.5 bars, leaving a breath at the end.
    const usable = Math.floor(phraseSteps * 0.8);
    const baseDur = Math.max(1, Math.floor(usable / Math.max(n, 1)));
    const durs: number[] = [];
    let used = 0;
    for (let i = 0; i < n; i++) {
      let d = baseDur;
      if (i === n - 1) d = Math.max(2, Math.min(phraseSteps - used - 1, baseDur * 3)); // hold last syllable
      else if (rng.chance(0.25) && baseDur > 1) d = baseDur + 1;
      durs.push(d);
      used += d;
    }

    // Arc-shaped contour with small random walk; ends on a chord tone.
    let deg = centerDeg + rng.pick([0, 1, 2]);
    const syllables = [];
    let step = phraseStart + (rng.chance(0.4) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const chord = chordAt[Math.floor(step / stepsPerBar)] ?? chordAt[chordAt.length - 1];
      const arcBias = i < n / 2 ? 0.6 : -0.7;
      const move = rng.pickWeighted([
        { value: -2, w: 1 },
        { value: -1, w: 2.5 - arcBias },
        { value: 0, w: 2.5 },
        { value: 1, w: 2.5 + arcBias },
        { value: 2, w: 0.8 },
      ]);
      deg = Math.max(centerDeg - 4, Math.min(centerDeg + (isChorus ? 7 : 5), deg + move));
      let midi = degreeToMidi(root, scale, deg);
      // Keep in singable range around the voice.
      while (midi < voice.baseMidi - 7) midi += 12;
      while (midi > voice.baseMidi + 12) midi -= 12;
      if (i === n - 1 || i === 0) midi = snapToChordTone(midi, chord);
      const vel = isChorus ? 0.95 : 0.8;
      syllables.push({ text: sylls[i], step, durSteps: durs[i], midi, vel });
      vocalNotes.push({ step, durSteps: durs[i], midi, vel });
      step += durs[i];
    }
    out.push({ text: line, syllables, startStep: phraseStart, endStep: step });
  }
  return out;
}

function addChordBar(
  out: NoteEvent[],
  rng: RNG,
  style: string,
  chord: Chord,
  barStart: number,
  spb: number,
  energy: number
) {
  const vel = 0.5 + energy * 0.4;
  const push = (offset: number, dur: number, v = vel, octave = 0) => {
    for (const p of chord.pitches) out.push({ step: barStart + offset, durSteps: dur, midi: p + octave, vel: v });
  };
  switch (style) {
    case "sustained":
      push(0, spb);
      break;
    case "stabs": {
      const hits = spb === 12 ? [0, 6] : rng.pick([[0, 6, 10], [2, 6, 12], [0, 7, 10]]);
      for (const h of hits) push(h, 2, vel * (0.8 + 0.2 * rng.next()));
      break;
    }
    case "offbeat": {
      const hits = spb === 12 ? [4, 8] : [2, 6, 10, 14];
      for (const h of hits) push(h, 1, vel * 0.85);
      break;
    }
    case "arpeggiated": {
      const seq = [...chord.pitches, chord.pitches[1] + 12];
      for (let i = 0; i < spb / 2; i++) {
        out.push({ step: barStart + i * 2, durSteps: 2, midi: seq[i % seq.length], vel: vel * 0.8 });
      }
      break;
    }
    case "alberti": {
      const [low, mid, high] = [chord.pitches[0], chord.pitches[1], chord.pitches[2] ?? chord.pitches[1] + 12];
      const pattern = [low, high, mid, high];
      for (let i = 0; i < spb / 2; i++) {
        out.push({ step: barStart + i * 2, durSteps: 2, midi: pattern[i % 4], vel: vel * 0.7 });
      }
      break;
    }
    case "comping": {
      let s = 0;
      while (s < spb - 2) {
        if (rng.chance(0.45)) push(s, rng.pick([2, 3, 4]), vel * (0.6 + 0.4 * rng.next()));
        s += rng.pick([2, 3, 4]);
      }
      break;
    }
    case "strummed": {
      const hits = spb === 12 ? [0, 4, 8, 10] : [0, 4, 6, 8, 12, 14];
      hits.forEach((h, i) => push(h, 2, vel * (i % 2 === 0 ? 0.9 : 0.6)));
      break;
    }
    case "pulsing": {
      for (let i = 0; i < spb / 2; i++) push(i * 2, 2, vel * (i % 2 === 0 ? 0.9 : 0.7));
      break;
    }
  }
}

function addBassBar(
  out: NoteEvent[],
  rng: RNG,
  style: string,
  chord: Chord,
  nextChord: Chord,
  barStart: number,
  spb: number,
  energy: number,
  root: number,
  scale: ScaleName
) {
  const r = chord.rootMidi - 12;
  const fifth = r + 7;
  const vel = 0.7 + energy * 0.3;
  switch (style) {
    case "root":
      out.push({ step: barStart, durSteps: spb / 2, midi: r, vel });
      out.push({ step: barStart + spb / 2, durSteps: spb / 2, midi: r, vel: vel * 0.85 });
      break;
    case "rootFifth": {
      const q = spb / 4;
      [r, fifth, r, fifth].forEach((m, i) => out.push({ step: barStart + i * q, durSteps: q, midi: m, vel: vel * (i === 0 ? 1 : 0.8) }));
      break;
    }
    case "walking": {
      const q = spb / 4;
      const third = chord.pitches[1] - 12;
      const approach = nextChord.rootMidi - 12 + rng.pick([-1, 1, -2, 2]);
      [r, third, fifth, approach].forEach((m, i) =>
        out.push({ step: barStart + i * q, durSteps: q, midi: m, vel: vel * (0.8 + 0.2 * rng.next()) })
      );
      break;
    }
    case "octaves": {
      for (let i = 0; i < spb / 2; i++) {
        out.push({ step: barStart + i * 2, durSteps: 2, midi: i % 2 === 0 ? r : r + 12, vel: vel * (i % 2 === 0 ? 1 : 0.8) });
      }
      break;
    }
    case "syncopated": {
      const pattern = rng.pick([
        [0, 3, 6, 10, 12],
        [0, 6, 8, 11, 14],
        [0, 3, 8, 10, 14],
      ]);
      for (const p of pattern) {
        if (p >= spb) continue;
        const m = rng.chance(0.25) ? fifth : rng.chance(0.2) ? r + 12 : r;
        out.push({ step: barStart + p, durSteps: 2, midi: m, vel: vel * (p === 0 ? 1 : 0.75 + 0.25 * rng.next()) });
      }
      break;
    }
    case "sub": {
      // 808-style: long note, occasional octave slide ornament.
      out.push({ step: barStart, durSteps: spb - 2, midi: r - 12 >= 24 ? r - 12 : r, vel });
      if (rng.chance(0.3)) out.push({ step: barStart + spb - 2, durSteps: 2, midi: r - 12 >= 24 ? r - 12 + 12 : r + 12, vel: vel * 0.7 });
      break;
    }
    case "drone":
      out.push({ step: barStart, durSteps: spb, midi: root - 12, vel: vel * 0.8 });
      break;
    default:
      out.push({ step: barStart, durSteps: spb, midi: r, vel });
  }
}

function addArpBar(out: NoteEvent[], chord: Chord, barStart: number, spb: number, energy: number, rng: RNG) {
  const pitches = [...chord.pitches.map((p) => p + 12), chord.pitches[0] + 24];
  const sixteenths = energy > 0.8;
  const stepLen = sixteenths ? 1 : 2;
  const count = spb / stepLen;
  const dir = rng.chance(0.5) ? 1 : -1;
  for (let i = 0; i < count; i++) {
    const idx = dir === 1 ? i % pitches.length : (pitches.length - 1 - (i % pitches.length));
    out.push({
      step: barStart + i * stepLen,
      durSteps: stepLen,
      midi: pitches[idx],
      vel: (i % 4 === 0 ? 0.85 : 0.6) * (0.5 + energy * 0.5),
    });
  }
}

function addDrumBar(
  out: DrumEvent[],
  rng: RNG,
  genre: GenreDef,
  barStart: number,
  spb: number,
  sec: Section,
  barInSection: number,
  fillBar: boolean
) {
  const patName = genre.drums[0];
  const pat = DRUM_PATTERNS[patName] ?? DRUM_PATTERNS.backbeat;
  const e = sec.energy;
  const isIntro = sec.type === "intro";
  const isBreakdown = sec.type === "breakdown" || sec.type === "bridge";
  const isOutro = sec.type === "outro";

  const lanes: { name: keyof typeof pat; drum: DrumEvent["drum"] }[] = [
    { name: "kick", drum: "kick" },
    { name: "snare", drum: "snare" },
    { name: "hatClosed", drum: "hatClosed" },
    { name: "hatOpen", drum: "hatOpen" },
    { name: "perc", drum: "perc" },
    { name: "ride", drum: "ride" },
    { name: "clap", drum: "clap" },
  ];

  for (const lane of lanes) {
    const arr = pat[lane.name] as number[] | undefined;
    if (!arr) continue;
    // Section-aware muting.
    if (isIntro && (lane.drum === "kick" || lane.drum === "snare") && barInSection < sec.bars / 2) continue;
    if (isBreakdown && lane.drum === "kick" && e < 0.5) continue;
    for (let i = 0; i < spb; i++) {
      const v = arr[i % arr.length];
      if (v <= 0) continue;
      let vel = v * (0.85 + 0.15 * rng.next()) * (0.6 + 0.4 * e);
      if (isOutro) vel *= 0.7;
      // Trap hat rolls: occasionally double up.
      if (genre.id === "trap" && lane.drum === "hatClosed" && rng.chance(0.12)) {
        out.push({ step: barStart + i, drum: "hatClosed", vel: vel * 0.6 });
      }
      out.push({ step: barStart + i, drum: lane.drum, vel });
    }
  }

  // Crash at high-energy section starts.
  if (barInSection === 0 && e >= 0.7) out.push({ step: barStart, drum: "crash", vel: 0.8 });

  // Fill on the last bar of a 4-bar phrase.
  if (fillBar && e >= 0.5 && rng.chance(0.7)) {
    const fillStart = barStart + spb - 4;
    for (let i = 0; i < 4; i++) {
      out.push({ step: fillStart + i, drum: "snare", vel: 0.5 + i * 0.13 });
    }
  }
}
