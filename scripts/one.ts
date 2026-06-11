import { OfflineAudioContext } from "node-web-audio-api";
(globalThis as Record<string, unknown>).OfflineAudioContext = OfflineAudioContext;
async function main() {
  const { composeSong } = await import("../lib/music/composer");
  const { renderSong } = await import("../lib/music/engine/render");
  const genreId = process.argv[2] ?? "trap";
  const song = composeSong({ prompt: "test", genreId, seed: 1 });
  const notes = song.tracks.reduce((s, t) => s + t.notes.length, 0);
  console.log(genreId, Math.round(song.durationSec) + "s", notes, "notes,", song.drums.length, "drums — rendering…");
  const t0 = Date.now();
  const buf = await renderSong(song);
  const d = buf.getChannelData(0);
  let peak = 0; for (let i = 0; i < d.length; i += 8) peak = Math.max(peak, Math.abs(d[i]));
  console.log("done in", ((Date.now() - t0) / 1000).toFixed(1) + "s, peak", peak.toFixed(3));
}
void main();
