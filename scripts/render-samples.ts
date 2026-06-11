// Render fresh listening samples after the register/mix/vocal overhaul.
import { OfflineAudioContext } from "node-web-audio-api";
import fs from "node:fs";

(globalThis as Record<string, unknown>).OfflineAudioContext = OfflineAudioContext;

async function main() {
  const { composeSong } = await import("../lib/music/composer");
  const { renderSong, audioBufferToWavBlob } = await import("../lib/music/engine/render");

  const cases = [
    { name: "funk-chante", prompt: "funk groove sur la danse et la fête", genreId: "funk", seed: 7 },
    { name: "synthwave-instrumental", prompt: "nuit en voiture sous les néons, instrumental", genreId: "synthwave", seed: 99 },
    { name: "bossa-chantee", prompt: "la mer et le soleil à Ipanema", genreId: "bossa", seed: 21 },
  ];

  for (const c of cases) {
    const song = composeSong({ prompt: c.prompt, genreId: c.genreId, seed: c.seed });
    const buf = await renderSong(song);
    const blob = audioBufferToWavBlob(buf);
    const ab = Buffer.from(await blob.arrayBuffer());
    // 40-second excerpt starting after the intro (~12s in).
    const sr = buf.sampleRate, ch = 2, bytes = 2;
    const startByte = 44 + Math.floor(sr * 12) * ch * bytes;
    const keep = Math.min(ab.length - startByte, sr * 40 * ch * bytes);
    const out = Buffer.concat([ab.subarray(0, 44), ab.subarray(startByte, startByte + keep)]);
    out.writeUInt32LE(out.length - 8, 4);
    out.writeUInt32LE(keep, 40);
    fs.writeFileSync(`/tmp/museo-${c.name}.wav`, out);
    console.log(`✓ ${c.name} — ${song.title} (${Math.round(song.durationSec)}s) → extrait ${(out.length / 1e6).toFixed(1)} Mo`);
  }
}

void main();
