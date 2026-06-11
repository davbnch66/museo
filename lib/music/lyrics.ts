// Local lyric engine: themed, rhymed French (or English) lyrics generated
// offline. The Claude adapter (app/api/lyrics) can replace this when a key
// is configured.

import type { RNG } from "./rng";
import type { LyricSection } from "./types";
import type { SectionType } from "./genres";

interface RhymeWord {
  w: string;
  themes?: string[];
}

const RHYME_FAMILIES: { suffix: string; words: RhymeWord[] }[] = [
  {
    suffix: "oir",
    words: [
      { w: "le soir", themes: ["nuit", "nostalgie"] },
      { w: "le noir", themes: ["nuit", "rupture"] },
      { w: "l'espoir", themes: ["liberté", "amour", "combat"] },
      { w: "un miroir", themes: ["rêve", "ville"] },
      { w: "le trottoir", themes: ["ville", "pluie"] },
      { w: "notre histoire", themes: ["amour", "rupture", "nostalgie"] },
      { w: "la mémoire", themes: ["nostalgie"] },
      { w: "te revoir", themes: ["amour", "rupture"] },
    ],
  },
  {
    suffix: "age",
    words: [
      { w: "le voyage", themes: ["route", "mer", "liberté"] },
      { w: "ton visage", themes: ["amour", "nostalgie"] },
      { w: "l'orage", themes: ["pluie", "combat", "feu"] },
      { w: "le rivage", themes: ["mer", "été"] },
      { w: "le courage", themes: ["combat", "liberté"] },
      { w: "un mirage", themes: ["rêve", "route", "espace"] },
      { w: "les nuages", themes: ["pluie", "rêve", "espace"] },
      { w: "une autre page", themes: ["rupture", "liberté"] },
    ],
  },
  {
    suffix: "ée",
    words: [
      { w: "la marée", themes: ["mer"] },
      { w: "l'année", themes: ["nostalgie"] },
      { w: "la soirée", themes: ["fête", "nuit"] },
      { w: "nos pensées", themes: ["rêve", "amour"] },
      { w: "la fumée", themes: ["ville", "feu"] },
      { w: "l'été", themes: ["été"] },
      { w: "la rosée", themes: ["nature"] },
      { w: "nos idées", themes: ["liberté", "rêve"] },
    ],
  },
  {
    suffix: "eur",
    words: [
      { w: "mon cœur", themes: ["amour", "rupture"] },
      { w: "la chaleur", themes: ["été", "feu", "amour"] },
      { w: "la peur", themes: ["combat", "nuit"] },
      { w: "les couleurs", themes: ["fête", "rêve", "nature"] },
      { w: "la douceur", themes: ["amour", "nature"] },
      { w: "le bonheur", themes: ["été", "fête", "amour"] },
      { w: "les hauteurs", themes: ["liberté", "espace"] },
      { w: "la rumeur", themes: ["ville", "mer"] },
    ],
  },
  {
    suffix: "i",
    words: [
      { w: "la nuit", themes: ["nuit"] },
      { w: "la pluie", themes: ["pluie"] },
      { w: "ma vie", themes: ["amour", "liberté", "nostalgie"] },
      { w: "l'envie", themes: ["amour", "fête", "route"] },
      { w: "l'oubli", themes: ["rupture", "nostalgie"] },
      { w: "infini", themes: ["espace", "mer", "rêve"] },
      { w: "minuit", themes: ["nuit", "fête"] },
      { w: "le bruit", themes: ["ville", "fête"] },
    ],
  },
  {
    suffix: "ant",
    words: [
      { w: "maintenant", themes: ["fête", "liberté", "combat"] },
      { w: "l'océan", themes: ["mer"] },
      { w: "le vent", themes: ["nature", "liberté", "route"] },
      { w: "en avant", themes: ["combat", "route"] },
      { w: "nos vingt ans", themes: ["nostalgie", "fête"] },
      { w: "le néant", themes: ["espace", "rupture", "nuit"] },
      { w: "un instant", themes: ["amour", "nostalgie"] },
      { w: "brûlant", themes: ["feu", "été", "amour"] },
    ],
  },
  {
    suffix: "elle",
    words: [
      { w: "éternelle", themes: ["amour", "espace"] },
      { w: "à tire-d'aile", themes: ["liberté", "nature"] },
      { w: "les étincelles", themes: ["feu", "fête"] },
      { w: "si belle", themes: ["amour", "été"] },
      { w: "vers le ciel", themes: ["espace", "liberté", "rêve"] },
      { w: "rebelle", themes: ["combat", "liberté"] },
      { w: "essentielle", themes: ["amour"] },
      { w: "irréelle", themes: ["rêve", "nuit"] },
    ],
  },
  {
    suffix: "ire",
    words: [
      { w: "ton sourire", themes: ["amour", "été"] },
      { w: "le navire", themes: ["mer", "route"] },
      { w: "mon empire", themes: ["combat", "ville"] },
      { w: "te le dire", themes: ["amour", "rupture"] },
      { w: "un soupir", themes: ["nostalgie", "rupture"] },
      { w: "l'avenir", themes: ["liberté", "rêve", "route"] },
      { w: "se souvenir", themes: ["nostalgie"] },
      { w: "partir", themes: ["route", "rupture", "liberté"] },
    ],
  },
];

// Line openers; {R} is replaced by the rhyme word. Written to scan at
// roughly 8–11 sung syllables once the rhyme word lands.
const VERSE_TEMPLATES = [
  "Je marche encore vers {R}",
  "Il reste un peu de {R}",
  "On a laissé derrière nous {R}",
  "J'ai gardé au fond de moi {R}",
  "Quelque part entre nous et {R}",
  "Les lumières dessinent {R}",
  "Je n'attendais plus que {R}",
  "Tout recommence avec {R}",
  "Sous nos pas s'efface {R}",
  "J'ai vu trembler {R}",
  "Le temps suspend {R}",
  "Personne n'éteindra {R}",
  "On s'invente {R}",
  "Je respire enfin {R}",
  "Là-bas nous attend {R}",
  "Rien n'effacera {R}",
];

const CHORUS_TEMPLATES = [
  "Et on chante pour {R}",
  "Plus fort que {R}",
  "C'est nous contre {R}",
  "On s'élève au-dessus de {R}",
  "Donne-moi {R}",
  "Rien ne vaut {R}",
  "On danse avec {R}",
  "Je veux vivre {R}",
];

const BRIDGE_TEMPLATES = [
  "Et si tout s'arrêtait ce soir",
  "Ferme les yeux, écoute encore",
  "Le silence en dit plus que tout",
  "Un dernier souffle avant la fin",
  "Regarde comme on a grandi",
  "Tout peut renaître ici",
];

// English fallback bank (kept compact).
const EN_RHYMES: { suffix: string; words: RhymeWord[] }[] = [
  {
    suffix: "ight",
    words: [
      { w: "the night", themes: ["nuit", "fête"] },
      { w: "the light", themes: ["liberté", "été"] },
      { w: "the fight", themes: ["combat"] },
      { w: "out of sight", themes: ["rupture", "route"] },
    ],
  },
  {
    suffix: "ay",
    words: [
      { w: "away", themes: ["route", "liberté"] },
      { w: "today", themes: ["fête"] },
      { w: "the waves", themes: ["mer"] },
      { w: "and stay", themes: ["amour"] },
    ],
  },
  {
    suffix: "ire",
    words: [
      { w: "the fire", themes: ["feu", "amour"] },
      { w: "higher", themes: ["liberté", "espace"] },
      { w: "desire", themes: ["amour"] },
      { w: "the wire", themes: ["ville"] },
    ],
  },
];

const EN_VERSE = [
  "We keep on running to {R}",
  "I still remember {R}",
  "There's something left in {R}",
  "We built our world on {R}",
  "I hear it calling through {R}",
  "Nothing can take {R}",
];
const EN_CHORUS = ["We sing for {R}", "Take me to {R}", "We rise above {R}", "Tonight we own {R}"];
const EN_BRIDGE = ["Close your eyes and breathe it in", "If it all ends tonight", "Look how far we've come"];

function pickRhymePair(rng: RNG, themes: string[], lang: "fr" | "en"): [string, string] {
  const families = lang === "fr" ? RHYME_FAMILIES : EN_RHYMES;
  const fam = rng.pick(families);
  const themed = fam.words.filter((w) => w.themes?.some((t) => themes.includes(t)));
  const pool = themed.length >= 2 ? themed : fam.words;
  const shuffled = rng.shuffle(pool);
  return [shuffled[0].w, shuffled[1 % shuffled.length].w];
}

function fillLine(rng: RNG, templates: string[], rhyme: string): string {
  return rng.pick(templates).replace("{R}", rhyme);
}

export interface LyricPlan {
  sections: LyricSection[];
  hook: string;
}

/**
 * Generate a full lyric sheet. Chorus lines are generated once and reused so
 * the song has a real, recognizable hook.
 */
export function generateLyrics(
  rng: RNG,
  themes: string[],
  title: string,
  structure: { type: SectionType }[],
  lang: "fr" | "en"
): LyricPlan {
  const t = themes.length ? themes : ["rêve"];
  const verseT = lang === "fr" ? VERSE_TEMPLATES : EN_VERSE;
  const chorusT = lang === "fr" ? CHORUS_TEMPLATES : EN_CHORUS;
  const bridgeT = lang === "fr" ? BRIDGE_TEMPLATES : EN_BRIDGE;

  // Build the chorus once.
  const [cr1, cr2] = pickRhymePair(rng, t, lang);
  const hookLine = title;
  const chorus = [
    fillLine(rng, chorusT, cr1),
    hookLine,
    fillLine(rng, chorusT, cr2),
    hookLine,
  ];

  const sections: LyricSection[] = [];
  let verseIdx = 0;
  for (const s of structure) {
    if (s.type === "verse") {
      const [r1, r2] = pickRhymePair(rng, t, lang);
      const [r3, r4] = pickRhymePair(rng, t, lang);
      sections.push({
        type: "verse",
        lines: [
          fillLine(rng, verseT, r1),
          fillLine(rng, verseT, r2),
          fillLine(rng, verseT, r3),
          fillLine(rng, verseT, r4),
        ],
      });
      verseIdx++;
    } else if (s.type === "prechorus") {
      const [r1, r2] = pickRhymePair(rng, t, lang);
      sections.push({ type: "prechorus", lines: [fillLine(rng, verseT, r1), fillLine(rng, verseT, r2)] });
    } else if (s.type === "chorus" || s.type === "drop") {
      sections.push({ type: s.type, lines: chorus });
    } else if (s.type === "bridge" || s.type === "breakdown") {
      sections.push({ type: s.type, lines: [rng.pick(bridgeT), rng.pick(bridgeT)] });
    } else {
      sections.push({ type: s.type, lines: [] });
    }
  }
  void verseIdx;
  return { sections, hook: hookLine };
}

/** Approximate sung-syllable segmentation (handles FR and EN well enough). */
export function syllabify(line: string): string[] {
  const words = line.split(/\s+/).filter(Boolean);
  const sylls: string[] = [];
  for (const word of words) {
    const clean = word.replace(/[.,!?;:«»"']/g, "");
    if (!clean) continue;
    const groups = clean.match(/[^aeiouyàâéèêëîïôûùœAEIOUY]*[aeiouyàâéèêëîïôûùœAEIOUY]+(?:[^aeiouyàâéèêëîïôûùœAEIOUY]+$)?/g);
    if (!groups || groups.length === 0) {
      sylls.push(clean);
    } else {
      sylls.push(...groups);
    }
  }
  return sylls.length ? sylls : ["la"];
}
