// End-to-end audio pipeline test through a real Web Audio implementation
// (node-web-audio-api): compose → render → inspect the actual signal.
import { OfflineAudioContext } from "node-web-audio-api";
import fs from "node:fs";

(globalThis as Record<string, unknown>).OfflineAudioContext = OfflineAudioContext;

async function main() {
  const { composeSong } = await import("../lib/music/composer");
  const { renderSong, audioBufferToWavBlob } = await import("../lib/music/engine/render");

  const cases = [
    { prompt: "Une chanson synthwave sur une nuit en voiture sous les néons", genreId: undefined },
    { prompt: "chant grégorien dans une abbaye", genreId: "gregorian" },
    { prompt: "trap sombre victoire", genreId: "trap" },
    { prompt: "valse de bal d'hiver", genreId: "waltz" },
  ];

  let fail = 0;
  for (const c of cases) {
    const song = composeSong({ prompt: c.prompt, genreId: c.genreId, seed: 1234 });
    const t0 = Date.now();
    const buf = await renderSong(song);
    const ms = Date.now() - t0;

    // Signal analysis: RMS + peak per third of the song.
    const data = buf.getChannelData(0);
    const third = Math.floor(data.length / 3);
    const stats = [0, 1, 2].map((i) => {
      let sum = 0, peak = 0;
      for (let j = i * third; j < (i + 1) * third; j += 4) {
        const v = data[j];
        sum += v * v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      return { rms: Math.sqrt(sum / (third / 4)), peak };
    });
    const ok = stats.every((s) => s.rms > 0.005 && s.peak > 0.03 && s.peak <= 1.0);
    if (!ok) fail++;
    console.log(
      `${ok ? "✓" : "✗"} ${song.genreName.padEnd(20)} ${Math.round(song.durationSec)}s rendu en ${(ms / 1000).toFixed(1)}s — RMS [${stats.map((s) => s.rms.toFixed(3)).join(", ")}], peaks [${stats.map((s) => s.peak.toFixed(2)).join(", ")}]`
    );
  }

  // Stem render (single track).
  const song = composeSong({ prompt: "funk groove", genreId: "funk", seed: 7 });
  const stem = await renderSong(song, { only: "bass" });
  const d = stem.getChannelData(0);
  let rms = 0;
  for (let i = 0; i < d.length; i += 8) rms += d[i] * d[i];
  rms = Math.sqrt(rms / (d.length / 8));
  console.log(`${rms > 0.003 ? "✓" : "✗"} stem basse seul — RMS ${rms.toFixed(4)}`);
  if (rms <= 0.003) fail++;

  // WAV encoding sanity.
  const full = await renderSong(song);
  const blob = audioBufferToWavBlob(full);
  const ab = Buffer.from(await blob.arrayBuffer());
  fs.writeFileSync("/tmp/museo-funk.wav", ab);
  const okWav = ab.subarray(0, 4).toString() === "RIFF" && ab.subarray(8, 12).toString() === "WAVE";
  console.log(`${okWav ? "✓" : "✗"} WAV encodé (${(ab.length / 1e6).toFixed(1)} Mo) → /tmp/museo-funk.wav`);
  if (!okWav) fail++;

  console.log(fail === 0 ? "\n✓ Pipeline audio complet OK" : `\n✗ ${fail} échec(s)`);
  process.exit(fail ? 1 : 0);
}

void main();
