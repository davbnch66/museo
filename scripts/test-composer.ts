// Smoke-test for the composition engine (pure logic — no Web Audio needed).
import { composeSong } from "../lib/music/composer";
import { GENRES } from "../lib/music/genres";

let failures = 0;
const check = (cond: boolean, msg: string) => {
  if (!cond) {
    failures++;
    console.error("  ✗", msg);
  }
};

const prompts = [
  "Une chanson synthwave sur une nuit en voiture sous les néons",
  "a happy summer love song on the beach",
  "Trap sombre sur la victoire après la lutte, 140 bpm",
];

for (const prompt of prompts) {
  const song = composeSong({ prompt });
  console.log(`\n"${prompt}"`);
  console.log(
    `  → ${song.title} · ${song.genreName} · ${song.bpm} BPM · ${song.scale} · ${Math.round(song.durationSec)}s · ${song.tracks.length} pistes · ${song.drums.length} hits batterie`
  );
  check(song.totalSteps > 0, "totalSteps > 0");
  check(song.tracks.length >= 2, "au moins 2 pistes");
  check(song.durationSec > 60 && song.durationSec < 360, `durée plausible (${song.durationSec}s)`);
  for (const t of song.tracks) {
    check(t.notes.length > 0, `piste ${t.id} non vide`);
    for (const n of t.notes) {
      check(n.midi >= 16 && n.midi <= 110, `${t.id}: midi dans la plage (${n.midi})`);
      check(n.step >= 0 && n.step < song.totalSteps, `${t.id}: step dans la grille`);
      check(n.durSteps > 0, `${t.id}: durée > 0`);
    }
  }
  if (song.voice) {
    const sylls = song.sections.flatMap((s) => s.lyricLines.flatMap((l) => l.syllables));
    check(sylls.length > 20, `assez de syllabes chantées (${sylls.length})`);
    check(song.lyrics.length > 0, "paroles présentes");
  }
  // Determinism
  const again = composeSong({ prompt, seed: song.seed, genreId: song.genreId });
  check(
    JSON.stringify(again.tracks) === JSON.stringify(song.tracks),
    "reproductible à seed égal"
  );
}

// Every genre composes without crashing.
console.log("\nTous les genres :");
for (const g of GENRES) {
  const song = composeSong({ prompt: "test du style", genreId: g.id, seed: 42 });
  const notes = song.tracks.reduce((s, t) => s + t.notes.length, 0);
  check(notes > 0, `${g.id}: contient des notes`);
  console.log(`  ${g.name.padEnd(24)} ${String(song.bpm).padStart(3)} BPM  ${String(song.tracks.length)} pistes  ${String(notes).padStart(5)} notes  ${song.drums.length ? "🥁" : "  "}`);
}

console.log(failures === 0 ? "\n✓ Tous les tests passent" : `\n✗ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
