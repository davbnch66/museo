"use client";

// The atlas: every style Museo speaks, arranged as a journey through the
// history of music. One click sends a style to the studio.

import { useRouter } from "next/navigation";
import { GENRES } from "@/lib/music/genres";

const ERA_ORDER = [
  "Moyen Âge",
  "Renaissance",
  "Baroque",
  "Période classique",
  "Romantisme",
  "XIXe siècle",
  "Fin XIXe",
  "Tradition andalouse",
  "Tradition indienne",
  "Tradition javanaise",
  "Tradition japonaise",
  "Tradition celtique",
  "Tradition mexicaine",
  "Début XXe",
  "1900s",
  "Années 1930-40",
  "Années 1950",
  "Années 1950-60",
  "Années 1960",
  "Années 1960-70",
  "Années 1970",
  "Années 1970-aujourd'hui",
  "Années 1980",
  "Années 1980 (revival)",
  "Années 1980-90",
  "Années 1990",
  "Années 1990-2000",
  "Années 2000",
  "Années 2010",
  "Années 2010-20",
  "Musique de film",
];

export default function ExplorePage() {
  const router = useRouter();
  const byEra = new Map<string, typeof GENRES>();
  for (const g of GENRES) {
    const list = byEra.get(g.era) ?? [];
    list.push(g);
    byEra.set(g.era, list);
  }
  const eras = [...byEra.keys()].sort((a, b) => {
    const ia = ERA_ORDER.indexOf(a);
    const ib = ERA_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const compose = (genreId: string, name: string) => {
    sessionStorage.setItem("museo:genre", genreId);
    router.push(`/?style=${genreId}`);
    void name;
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display mb-2 text-3xl font-bold">L&apos;atlas musical</h1>
      <p className="mb-8 text-sm text-muted">
        Un voyage à travers les époques et les cultures. Chaque style est encodé dans le musicologue de Museo :
        gammes, rythmes, instruments et formes authentiques.
      </p>
      <div className="relative ml-3 border-l border-edge pl-6">
        {eras.map((era) => (
          <div key={era} className="relative mb-10">
            <span className="absolute -left-[31px] top-1 h-2.5 w-2.5 rounded-full bg-accent" />
            <h2 className="font-display mb-3 text-lg font-bold text-foreground">{era}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {byEra.get(era)!.map((g) => (
                <div
                  key={g.id}
                  className="rounded-xl border border-edge bg-surface p-4 transition hover:border-accent/60"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-display font-bold" style={{ color: `hsl(${g.hue}, 75%, 72%)` }}>
                      {g.name}
                    </h3>
                    <span className="shrink-0 text-[10px] text-muted">
                      {g.years} · {g.region}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{g.description}</p>
                  <button
                    onClick={() => compose(g.id, g.name)}
                    className="mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-80"
                    style={{ background: `hsla(${g.hue}, 75%, 60%, 0.15)`, color: `hsl(${g.hue}, 80%, 75%)` }}
                  >
                    ♪ Composer dans ce style
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
