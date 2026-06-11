// English style prompts for the neural engines (MusicGen understands English
// best). One descriptor per Museo style, plus mood adjectives from the user's
// description.

import type { GenreDef } from "../music/genres";
import type { Mood } from "../music/types";

const STYLE_TAGS: Record<string, string> = {
  gregorian: "gregorian chant, monastic choir, sacred medieval vocals, cathedral reverb",
  medieval: "medieval folk dance, fiddle and flute over a drone, tambourine, troubadour music",
  renaissance: "renaissance lute consort, delicate counterpoint, court dance",
  baroque: "baroque harpsichord concerto, ornate counterpoint, strings, Bach style",
  classical: "classical period piano and string orchestra, elegant Mozart style sonata",
  romantic: "romantic era expressive solo piano with lush strings, Chopin nocturne style",
  impressionist: "impressionist piano, dreamy floating harmonies, Debussy style, soft strings",
  waltz: "viennese waltz, orchestral strings in 3/4, elegant ballroom dance",
  flamenco: "flamenco spanish guitar, passionate phrygian melodies, palmas handclaps",
  raga: "indian classical raga, sitar and tabla over tanpura drone, meditative",
  gamelan: "indonesian gamelan ensemble, metallophones and gongs, interlocking patterns",
  koto: "japanese koto traditional music, zen, sparse and contemplative",
  celtic: "celtic folk jig, fiddle and tin whistle, harp, irish traditional dance",
  mariachi: "mexican mariachi band, bright trumpets, vihuela and guitarrón, festive",
  tango: "argentine tango, dramatic bandoneon and violin, marcato strings",
  "delta-blues": "delta blues, slide guitar, twelve bar blues, raw and dusty",
  ragtime: "ragtime piano, stride left hand, joplin style, upbeat saloon piano",
  swing: "1940s big band swing jazz, brass section, walking bass, swinging drums",
  "cool-jazz": "cool jazz quartet, muted trumpet, brushed drums, upright bass, smoky club",
  bossa: "bossa nova, nylon guitar, soft brazilian groove, smooth jazz harmonies",
  soul: "1960s motown soul, electric piano, horn section, warm groove",
  rock: "classic rock, electric guitars, driving drums, anthemic 70s rock",
  funk: "funk groove, slap bass, wah guitar, electric piano, horn stabs, tight drums",
  afrobeat: "afrobeat, polyrhythmic percussion, horns, hypnotic groove, Fela style",
  reggae: "reggae, offbeat skank guitar, deep bass, one drop drums, laid back",
  disco: "disco, four on the floor, funky octave bassline, strings, 70s dancefloor",
  synthwave: "synthwave, retro 80s analog synths, pulsing bass, neon nostalgia, outrun",
  chiptune: "chiptune 8-bit video game music, square wave melodies, fast arpeggios",
  house: "house music, four on the floor kick, piano stabs, open hats, club groove",
  techno: "dark hypnotic techno, driving kick, acid sequences, warehouse rave",
  trance: "uplifting trance, supersaw leads, rolling arpeggios, euphoric breakdown",
  ambient: "ambient soundscape, slowly evolving warm pads, weightless, Brian Eno style",
  boombap: "90s boom bap hip hop beat, dusty jazz samples, punchy drums, vinyl crackle",
  trap: "trap beat, booming 808 bass, rapid hi hats, dark atmospheric synths",
  reggaeton: "reggaeton, dembow rhythm, latin urban groove, catchy synth hooks",
  lofi: "lofi hip hop, mellow jazzy piano, soft drums, vinyl crackle, chill study beats",
  kpop: "modern dance pop, polished production, catchy synth hooks, punchy drums",
  epic: "epic cinematic orchestral trailer music, heroic brass, ostinato strings, choir, war drums",
  metal: "heavy metal, distorted guitar riffs, double kick drums, aggressive and dark",
};

export function buildNeuralPrompt(genre: GenreDef, mood: Mood, bpm: number): string {
  const tags = STYLE_TAGS[genre.id] ?? genre.name;
  const adjectives: string[] = [];
  if (mood.energy > 0.7) adjectives.push("energetic");
  else if (mood.energy < 0.3) adjectives.push("calm, slow");
  if (mood.valence > 0.3) adjectives.push("uplifting, joyful");
  else if (mood.valence < -0.3) adjectives.push("melancholic, dark");
  const themeWords: Record<string, string> = {
    nuit: "nocturnal",
    mer: "oceanic",
    espace: "spacey",
    pluie: "rainy mood",
    été: "summer vibes",
    fête: "party",
    combat: "intense",
    liberté: "soaring",
    nostalgie: "nostalgic",
    rêve: "dreamy",
    feu: "fiery",
    amour: "romantic",
  };
  for (const t of mood.themes) if (themeWords[t]) adjectives.push(themeWords[t]);
  return [tags, adjectives.join(", "), `${bpm} bpm`, "high quality"].filter(Boolean).join(", ");
}
