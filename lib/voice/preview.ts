"use client";

// Quick voice preview: the voice sings a short test phrase.

import { singSyllable } from "../music/engine/vocals";
import { makeReverbImpulse } from "../music/engine/synth";
import type { Syllable, VoiceConfig } from "../music/types";

let ctx: AudioContext | null = null;

export async function previewVoice(voice: VoiceConfig): Promise<void> {
  const off = new OfflineAudioContext(2, 44100 * 4, 44100);
  const master = off.createGain();
  master.gain.value = 0.9;
  master.connect(off.destination);
  const reverb = off.createConvolver();
  reverb.buffer = makeReverbImpulse(off, 2, 2.5);
  const send = off.createGain();
  send.gain.value = 0.3;
  send.connect(reverb);
  reverb.connect(master);

  const base = voice.baseMidi;
  const phrase: { text: string; midi: number; t: number; d: number }[] = [
    { text: "mu", midi: base, t: 0.2, d: 0.4 },
    { text: "sé", midi: base + 4, t: 0.65, d: 0.4 },
    { text: "o", midi: base + 7, t: 1.1, d: 0.55 },
    { text: "chan", midi: base + 5, t: 1.75, d: 0.4 },
    { text: "te", midi: base + 4, t: 2.2, d: 0.4 },
    { text: "la", midi: base, t: 2.65, d: 0.9 },
  ];
  let prev: number | null = null;
  for (const p of phrase) {
    const syl: Syllable = { text: p.text, step: 0, durSteps: 0, midi: p.midi, vel: 0.9 };
    singSyllable(off, master, syl, p.t, p.d, voice, { prevMidi: prev });
    singSyllable(off, send, syl, p.t, p.d, voice, { prevMidi: prev });
    prev = p.midi;
  }
  const buf = await off.startRendering();
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
}
