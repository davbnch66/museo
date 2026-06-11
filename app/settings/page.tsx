"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/store/db";

interface Providers {
  anthropic: boolean;
  replicate: boolean;
  elevenlabs: boolean;
}

export default function SettingsPage() {
  const [providers, setProviders] = useState<Providers | null>(null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    void fetch("/api/providers")
      .then((r) => r.json())
      .then(setProviders)
      .catch(() => setProviders({ anthropic: false, replicate: false, elevenlabs: false }));
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display mb-2 text-3xl font-bold">Réglages</h1>
      <p className="mb-8 text-sm text-muted">
        Museo fonctionne entièrement en local : composition algorithmique, synthèse Web Audio, voix à
        formants, clips sur canvas. Les fournisseurs « pro » ci-dessous sont optionnels et s&apos;activent par
        clé d&apos;API.
      </p>

      <section className="mb-8 rounded-2xl border border-edge bg-surface p-5">
        <h2 className="font-display mb-4 text-xl font-bold">Fournisseurs pro</h2>
        <div className="flex flex-col gap-3 text-sm">
          <ProviderRow
            name="Anthropic (Claude)"
            role="Paroles de niveau professionnel, adaptées au genre et au thème"
            envVar="ANTHROPIC_API_KEY"
            active={providers?.anthropic}
          />
          <ProviderRow
            name="Replicate (MusicGen)"
            role="Génération audio neuronale en alternative au moteur local"
            envVar="REPLICATE_API_TOKEN"
            active={providers?.replicate}
          />
          <ProviderRow
            name="ElevenLabs"
            role="Clonage vocal neuronal (avec consentement) et design de voix"
            envVar="ELEVENLABS_API_KEY"
            active={providers?.elevenlabs}
          />
        </div>
        <p className="mt-4 rounded-lg bg-surface2 p-3 font-mono text-xs text-muted">
          # .env.local
          <br />
          ANTHROPIC_API_KEY=sk-ant-…
          <br />
          REPLICATE_API_TOKEN=r8_…
          <br />
          ELEVENLABS_API_KEY=…
        </p>
      </section>

      <section className="mb-8 rounded-2xl border border-edge bg-surface p-5">
        <h2 className="font-display mb-2 text-xl font-bold">Confidentialité & consentement</h2>
        <ul className="list-inside list-disc space-y-1 text-sm text-muted">
          <li>Morceaux, voix et clips sont stockés dans votre navigateur (IndexedDB) — rien ne quitte l&apos;appareil sans action de votre part.</li>
          <li>L&apos;enregistrement de votre voix exige un consentement explicite, horodaté et conservé avec la voix.</li>
          <li>La voix de chant locale est volontairement synthétique : elle s&apos;inspire de votre registre sans imiter votre identité vocale.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-edge bg-surface p-5">
        <h2 className="font-display mb-2 text-xl font-bold">Données</h2>
        <button
          onClick={async () => {
            if (confirm("Supprimer définitivement tous les morceaux, voix et clips stockés localement ?")) {
              await db.clearAll();
              setCleared(true);
            }
          }}
          className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
        >
          Tout effacer
        </button>
        {cleared && <p className="mt-2 text-xs text-muted">Bibliothèque effacée.</p>}
      </section>
    </div>
  );
}

function ProviderRow({ name, role, envVar, active }: { name: string; role: string; envVar: string; active?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-edge bg-surface2 p-3">
      <div>
        <p className="font-semibold">{name}</p>
        <p className="text-xs text-muted">{role}</p>
      </div>
      <div className="text-right">
        <span
          className={`rounded-full px-2.5 py-1 text-xs ${active ? "bg-green-500/15 text-green-400" : "bg-surface text-muted"}`}
        >
          {active === undefined ? "…" : active ? "● actif" : "○ non configuré"}
        </span>
        <p className="mt-1 font-mono text-[10px] text-muted">{envVar}</p>
      </div>
    </div>
  );
}
