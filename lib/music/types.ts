import type { InstrumentId, SectionType } from "./genres";
import type { ScaleName } from "./theory";

/** All times are on a global 16th-note step grid. */
export interface NoteEvent {
  step: number;
  durSteps: number;
  midi: number;
  vel: number; // 0..1
}

export type DrumName = "kick" | "snare" | "hatClosed" | "hatOpen" | "perc" | "ride" | "clap" | "crash";

export interface DrumEvent {
  step: number;
  drum: DrumName;
  vel: number;
}

export type TrackRole = "bass" | "chords" | "melody" | "pad" | "arp" | "drone" | "vocal";

export interface Track {
  id: string;
  role: TrackRole;
  instrument: InstrumentId;
  notes: NoteEvent[];
  gain: number;
  pan: number; // -1..1
}

export interface Syllable {
  text: string;
  step: number;
  durSteps: number;
  midi: number;
  vel: number;
}

export interface VocalLine {
  text: string;
  syllables: Syllable[];
  startStep: number;
  endStep: number;
}

export interface Section {
  type: SectionType;
  bars: number;
  startStep: number;
  endStep: number;
  energy: number;
  lyricLines: VocalLine[];
}

export interface LyricSection {
  type: SectionType;
  lines: string[];
}

export interface Mood {
  energy: number; // 0..1
  valence: number; // -1..1 (sombre → lumineux)
  themes: string[];
  hue: number;
  descriptors: string[];
}

export interface VoiceConfig {
  /** Identifies a designed/cloned voice profile, or "museo-default". */
  voiceId: string;
  name: string;
  /** Formant-singer parameters (local engine). */
  baseMidi: number; // comfortable register center
  brightness: number; // 0..1
  breathiness: number; // 0..1
  vibratoHz: number;
  vibratoDepth: number; // semitones
  gender: "feminine" | "masculine" | "neutral" | "ethereal";
  /** Provenance, for consent tracking. */
  source: "designed" | "user-recording" | "default";
  consent?: { granted: boolean; date: string; statement: string };
}

export interface Song {
  id: string;
  title: string;
  prompt: string;
  createdAt: number;
  seed: number;
  genreId: string;
  genreName: string;
  bpm: number;
  rootMidi: number;
  scale: ScaleName;
  swing: number;
  stepsPerBar: number;
  sections: Section[];
  tracks: Track[];
  drums: DrumEvent[];
  lyrics: LyricSection[];
  mood: Mood;
  voice: VoiceConfig | null;
  totalSteps: number;
  durationSec: number;
  /** "local" (compositeur + synthèse) ou "neural" (audio généré par modèle). */
  engine?: "local" | "neural";
  /** Clé du blob audio en IndexedDB pour les morceaux neuronaux. */
  audioKey?: string;
  /** Prompt anglais envoyé au modèle neuronal. */
  neuralPrompt?: string;
}

export const DEFAULT_VOICE: VoiceConfig = {
  voiceId: "museo-default",
  name: "Lumen (voix Museo)",
  baseMidi: 64,
  brightness: 0.6,
  breathiness: 0.25,
  vibratoHz: 5.2,
  vibratoDepth: 0.35,
  gender: "neutral",
  source: "default",
};
