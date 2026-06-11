import { OfflineAudioContext } from "node-web-audio-api";
(globalThis as Record<string, unknown>).OfflineAudioContext = OfflineAudioContext;
async function main() {
  const { composeSong } = await import("../lib/music/composer");
  const { renderSong } = await import("../lib/music/engine/render");
  const song = composeSong({ prompt: "test", genreId: "synthwave", seed: 1 });
  console.log("tracks:", song.tracks.map((t) => `${t.id}(${t.instrument},${t.notes.length})`).join(" "));
  const ids = [...song.tracks.map((t) => t.id), "drums"];
  for (const id of ids) {
    const t0 = Date.now();
    process.stdout.write(`${id}… `);
    await renderSong(song, { only: id });
    console.log(`ok ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
}
void main();
