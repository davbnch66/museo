# Museo — guide agent

App Next.js (App Router, TS, Tailwind v4) de création musicale par IA, local-first.

- Cœur musical : `lib/music/` (théorie → genres → composer → engine). Déterministe par seed.
- Rendu audio : Web Audio uniquement (OfflineAudioContext), aucun sample externe.
- Tests : `npm run test:composer` (logique pure) et `npm run test:render` (signal réel via node-web-audio-api).
- Build : `npm run build`. Lint : `npm run lint`.
- Les routes `app/api/*` sont des adaptateurs optionnels activés par clés (.env.local) ; l’app doit toujours fonctionner sans.
