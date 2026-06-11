// Prompt understanding: extract mood, themes, tempo hints and a title from a
// free-text description (French or English).

import { hashString, makeRNG } from "./rng";
import type { Mood } from "./types";

export interface ThemeDef {
  id: string;
  match: string[];
  hue: number;
  valence: number;
}

export const THEMES: ThemeDef[] = [
  { id: "amour", match: ["amour", "love", "cœur", "coeur", "aimer", "tendresse", "romant"], hue: 340, valence: 0.5 },
  { id: "rupture", match: ["rupture", "breakup", "quitté", "adieu", "perdu", "absence", "manque"], hue: 250, valence: -0.7 },
  { id: "nuit", match: ["nuit", "night", "minuit", "étoile", "lune", "nocturne", "insomnie"], hue: 230, valence: -0.1 },
  { id: "mer", match: ["mer", "océan", "ocean", "vague", "plage", "marin", "sea", "horizon"], hue: 195, valence: 0.3 },
  { id: "ville", match: ["ville", "city", "néon", "neon", "rue", "métro", "urbain", "béton", "trottoir"], hue: 285, valence: 0 },
  { id: "route", match: ["route", "road", "voyage", "partir", "ailleurs", "autoroute", "horizon", "trip"], hue: 35, valence: 0.4 },
  { id: "espace", match: ["espace", "space", "cosmos", "galaxie", "planète", "astronaute", "étoiles", "univers"], hue: 260, valence: 0.2 },
  { id: "pluie", match: ["pluie", "rain", "orage", "gris", "brume", "nuage", "automne"], hue: 210, valence: -0.4 },
  { id: "été", match: ["été", "summer", "soleil", "chaleur", "vacances", "sable"], hue: 45, valence: 0.8 },
  { id: "fête", match: ["fête", "party", "danser", "dance", "club", "samedi", "célébr"], hue: 315, valence: 0.8 },
  { id: "combat", match: ["combat", "guerre", "bataille", "lutte", "victoire", "guerrier", "battle", "rage"], hue: 5, valence: -0.3 },
  { id: "liberté", match: ["liberté", "libre", "freedom", "envol", "voler", "échapper", "fuir"], hue: 165, valence: 0.6 },
  { id: "nostalgie", match: ["nostalgie", "souvenir", "memory", "enfance", "autrefois", "passé", "mélancolie"], hue: 30, valence: -0.3 },
  { id: "nature", match: ["forêt", "montagne", "rivière", "nature", "arbre", "fleur", "jardin", "oiseau"], hue: 120, valence: 0.5 },
  { id: "rêve", match: ["rêve", "dream", "songe", "imaginaire", "magie", "féerie"], hue: 275, valence: 0.4 },
  { id: "feu", match: ["feu", "fire", "flamme", "brûle", "incendie", "braise"], hue: 18, valence: 0.1 },
];

const POSITIVE = ["joie", "heureux", "happy", "lumière", "light", "espoir", "hope", "sourire", "doux", "douce", "beau", "belle", "victoire", "soleil", "danser", "fête", "amour", "libre", "joyeux", "festif"];
const NEGATIVE = ["triste", "sad", "sombre", "dark", "peur", "mort", "larme", "pleure", "froid", "seul", "solitude", "douleur", "mélancol", "perdu", "noir", "tragique", "adieu"];
const HIGH_ENERGY = ["énergique", "rapide", "fast", "intense", "puissant", "explosif", "furieux", "danser", "fête", "épique", "rage", "course", "sprint"];
const LOW_ENERGY = ["calme", "doux", "douce", "lent", "slow", "berceuse", "chill", "détente", "relax", "méditation", "apaisant", "sommeil", "tranquille"];

export interface PromptAnalysis {
  mood: Mood;
  bpmHint: number | null;
  wantsInstrumental: boolean;
  title: string;
  language: "fr" | "en";
}

export function analyzePrompt(prompt: string, fallbackHue: number, baseEnergy: number, seed = 0): PromptAnalysis {
  const p = prompt.toLowerCase();

  const themes = THEMES.filter((t) => t.match.some((m) => p.includes(m)));
  let valence = themes.length ? themes.reduce((s, t) => s + t.valence, 0) / themes.length : 0.1;
  for (const w of POSITIVE) if (p.includes(w)) valence += 0.15;
  for (const w of NEGATIVE) if (p.includes(w)) valence -= 0.2;
  valence = Math.max(-1, Math.min(1, valence));

  let energy = baseEnergy;
  for (const w of HIGH_ENERGY) if (p.includes(w)) energy += 0.12;
  for (const w of LOW_ENERGY) if (p.includes(w)) energy -= 0.15;
  energy = Math.max(0.05, Math.min(1, energy));

  const bpmMatch = p.match(/(\d{2,3})\s*bpm/);
  const bpmHint = bpmMatch ? parseInt(bpmMatch[1], 10) : null;

  const wantsInstrumental = /instrumental|sans (voix|paroles)|no vocals?/.test(p);

  const frHits = (p.match(/\b(une?|le|la|les|des|sur|avec|pour|chanson|qui|dans|et)\b/g) ?? []).length;
  const enHits = (p.match(/\b(the|a|an|with|about|song|that|and|of|in)\b/g) ?? []).length;
  const language: "fr" | "en" = enHits > frHits ? "en" : "fr";

  const hue = themes.length ? themes[0].hue : fallbackHue;

  const descriptors = [...new Set([...themes.map((t) => t.id)])];

  return {
    mood: { energy, valence, themes: themes.map((t) => t.id), hue, descriptors },
    bpmHint,
    wantsInstrumental,
    title: makeTitle(prompt, themes.map((t) => t.id), seed),
    language,
  };
}

const TITLE_WORDS: Record<string, string[]> = {
  amour: ["À fleur de toi", "Battements", "Nos deux silences", "Encore toi"],
  rupture: ["Après toi", "Les restes du feu", "Dernier quai", "Sans retour"],
  nuit: ["Minuit pile", "Veilleuse", "La nuit nous appartient", "Heures bleues"],
  mer: ["Marée haute", "Sel sur la peau", "Cap au large", "Écume"],
  ville: ["Néons fatigués", "Béton tendre", "Dernier métro", "Toits de la ville"],
  route: ["Kilomètre zéro", "Plein ouest", "La route est à nous", "Essence et poussière"],
  espace: ["Apesanteur", "Année-lumière", "Orbite", "Poussière d'étoiles"],
  pluie: ["Petite pluie", "Ciel bas", "Gouttes sur la vitre", "L'orage attendra"],
  été: ["Plein soleil", "Juillet sans fin", "Peau dorée", "Saison chaude"],
  fête: ["Jusqu'au matin", "Confettis", "Le sol tremble", "Samedi soir"],
  combat: ["Debout", "Armure", "Le dernier round", "Invaincus"],
  liberté: ["Grand large", "Sans laisse", "Ciel ouvert", "Évasion"],
  nostalgie: ["Polaroïds", "C'était hier", "Vieux quartier", "Madeleine"],
  nature: ["Sous les frênes", "Clairière", "Le chant des pins", "Racines"],
  rêve: ["Lucide", "Entre deux mondes", "Songe d'or", "Paupières closes"],
  feu: ["Braises", "Tout brûler", "Phénix", "Étincelles"],
};

function makeTitle(prompt: string, themeIds: string[], seed: number): string {
  // Quoted text in the prompt becomes the title.
  const quoted = prompt.match(/[«"']([^«»"']{3,40})[»"']/);
  if (quoted) return quoted[1].trim();
  const rng = makeRNG(hashString(prompt) ^ seed);
  for (const t of themeIds) {
    const opts = TITLE_WORDS[t];
    if (opts) return opts[Math.floor(rng.next() * opts.length)];
  }
  // Fallback: first few meaningful words, title-cased.
  const words = prompt
    .replace(/[.,!?;:]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 3);
  if (words.length) return words.join(" ").replace(/^./, (c) => c.toUpperCase());
  return "Sans titre";
}
