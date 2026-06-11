# Museo 🎼

**Studio de création musicale par IA** — décrivez un morceau, Museo compose la musique, écrit les paroles, chante, puis transforme le tout en clip vidéo en un clic.

Museo est *local-first* : la composition, la synthèse audio, la voix et les clips fonctionnent entièrement dans votre navigateur, sans clé d'API ni serveur de génération. Des fournisseurs « pro » optionnels (Claude, Replicate, ElevenLabs) s'activent par simple clé.

## Fonctionnalités

- **Génération de morceaux complets** : description libre → titre, structure (couplets/refrains/pont), harmonie, basse, mélodie, batterie, paroles et chant.
- **Tout l'éventail de l'histoire de la musique** : 39 styles encodés avec leurs gammes, rythmes, instruments et formes authentiques — du chant grégorien au gamelan, du delta blues à la trap, de la valse viennoise à la trance.
- **Moteur audio 100 % synthétisé** (Web Audio) : ~30 instruments (synthés soustractifs/FM, Karplus-Strong, batteries 808/909, reverb à convolution), rendu offline en WAV.
- **Voix chantée** : un chanteur de synthèse à formants interprète les paroles syllabe par syllabe (vibrato, portamento, consonnes). Timbre volontairement synthétique et assumé.
- **Voice Lab** :
  - *Voice designer* — invente des voix originales entièrement seul (ou affinez aux curseurs) ;
  - *Ma propre voix* — enregistrez-vous **avec consentement explicite** ; Museo détecte votre registre et accorde le chant sur votre tessiture. Clonage neuronal possible via ElevenLabs (même parcours de consentement).
- **Clip vidéo en un clic** : analyse automatique des paroles, du thème et de l'énergie → clip audio-réactif (scènes thématiques, typographie karaoké), filmé en temps réel, export WebM.
- **Et tout ce qui rend l'expérience aboutie** : bibliothèque locale (IndexedDB), variations par seed, remix inter-genres, export WAV + stems par piste, atlas musical interactif, paroles personnalisées.

## Démarrer

```bash
npm install
npm run dev
# → http://localhost:3000
```

### Mode pro (optionnel)

Créez `.env.local` :

```bash
ANTHROPIC_API_KEY=sk-ant-…     # paroles écrites par Claude
REPLICATE_API_TOKEN=r8_…       # audio neuronal (MusicGen) en alternative au moteur local
ELEVENLABS_API_KEY=…           # clonage vocal neuronal (avec consentement)
```

L'état des fournisseurs est visible dans **Réglages**.

## Architecture

```
lib/music/
  theory.ts      gammes (majeur → maqam, slendro, hirajoshi…), accords, progressions, rythmes
  genres.ts      l'atlas : 39 définitions de styles (tempo, harmonie, instrumentation, forme)
  prompt.ts      analyse du prompt : thèmes, valence, énergie, titre, langue
  lyrics.ts      moteur de paroles local (rimes thématiques FR/EN)
  composer.ts    prompt → chanson arrangée (déterministe par seed)
  engine/        synthèse Web Audio : instruments, batteries, voix à formants, rendu WAV
lib/video/clip.ts  générateur de clips (canvas + MediaRecorder)
lib/voice/         analyse de pitch (autocorrélation) + designer de voix
lib/store/db.ts    persistance locale (IndexedDB)
app/               Studio · Bibliothèque · Morceau · Voice Lab · Explorer · Réglages
app/api/           adaptateurs pro : /lyrics (Claude) · /music (Replicate) · /voice (ElevenLabs)
```

## Tests

```bash
npm run test:composer   # le compositeur : 39 genres, plages MIDI, déterminisme
npm run test:render     # rendu audio réel (node-web-audio-api) : analyse du signal, stems, WAV
```

## Confidentialité

Morceaux, voix et clips restent dans votre navigateur. L'enregistrement de votre voix exige un consentement explicite, horodaté et stocké avec la voix.
