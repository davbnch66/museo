"use client";

import { useEffect, useMemo, useState } from "react";
import SongView from "@/components/SongView";
import { GENRES, matchGenre } from "@/lib/music/genres";
import type { Song } from "@/lib/music/types";
import { NeuralEngine, Stage, generateNeural, generateSong } from "@/lib/flow";
import type { NeuralProgress } from "@/lib/neural/engine";
import { StoredVoice, db } from "@/lib/store/db";

type EngineChoice = "neural-browser" | "replicate" | "local";

const EXAMPLES = [
  "Une chanson synthwave sur une nuit en voiture sous les néons",
  "Valse viennoise mélancolique pour un bal d'hiver",
  "Trap sombre sur la victoire après la lutte",
  "Bossa nova ensoleillée, la mer à Ipanema",
  "Chant grégorien dans une abbaye au crépuscule",
  "Morceau épique de bataille avec chœurs et percussions",
  "Lo-fi pluvieux pour réviser, instrumental",
  "Raga indien méditatif au lever du soleil",
];

export default function StudioPage() {
  const [prompt, setPrompt] = useState("");
  const [genreId, setGenreId] = useState<string>(() =>
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("style") ?? ""
  );
  const [instrumental, setInstrumental] = useState(false);
  const [voiceId, setVoiceId] = useState("museo-default");
  const [voices, setVoices] = useState<StoredVoice[]>([]);
  const [customLyrics, setCustomLyrics] = useState("");
  const [showLyrics, setShowLyrics] = useState(false);
  const [useProLyrics, setUseProLyrics] = useState(false);
  const [proAvailable, setProAvailable] = useState(false);
  const [engine, setEngine] = useState<EngineChoice>("neural-browser");
  const [replicateAvailable, setReplicateAvailable] = useState(false);
  const [duration, setDuration] = useState(15);
  const [neuralProgress, setNeuralProgress] = useState<NeuralProgress | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ song: Song; buffer: AudioBuffer } | null>(null);

  useEffect(() => {
    void db.listVoices().then(setVoices);
    void fetch("/api/providers")
      .then((r) => r.json())
      .then((p) => {
        setProAvailable(!!p.anthropic);
        setUseProLyrics(!!p.anthropic);
        setReplicateAvailable(!!p.replicate);
        if (p.replicate) setEngine("replicate");
      })
      .catch(() => {});
  }, []);

  const detected = useMemo(() => (prompt.trim() ? matchGenre(prompt) : null), [prompt]);

  const generate = async () => {
    if (!prompt.trim() || stage) return;
    setError(null);
    setResult(null);
    setNeuralProgress(null);
    try {
      if (engine === "local") {
        const voice =
          voiceId === "museo-default" ? undefined : voices.find((v) => v.voiceId === voiceId) ?? undefined;
        const out = await generateSong(
          {
            prompt: prompt.trim(),
            genreId: genreId || undefined,
            instrumental: instrumental || undefined,
            voice,
            customLyrics: customLyrics.trim() || null,
            useProLyrics,
          },
          setStage
        );
        setResult(out);
      } else {
        setStage("interprétation");
        const out = await generateNeural(
          {
            prompt: prompt.trim(),
            genreId: genreId || undefined,
            durationSec: duration,
            engine: (engine === "replicate" ? "replicate" : "browser") as NeuralEngine,
          },
          setNeuralProgress
        );
        setResult(out);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de génération");
    } finally {
      setStage(null);
      setNeuralProgress(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 text-center">
        <h1 className="font-display text-4xl font-bold md:text-5xl">
          Que voulez-vous <span className="text-accent">entendre</span> ?
        </h1>
        <p className="mt-2 text-sm text-muted">
          Décrivez un morceau — Museo compose la musique, écrit les paroles et chante. Toute l&apos;histoire
          de la musique, du chant grégorien à la trap.
        </p>
      </div>

      <div className="rounded-2xl border border-edge bg-surface p-4 md:p-5">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Ex. : une chanson disco joyeuse sur un amour d'été qui ne veut pas finir…"
          className="w-full resize-none rounded-xl border border-edge bg-surface2 p-4 text-sm outline-none placeholder:text-muted focus:border-accent"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2">
            <span className="text-muted">Moteur</span>
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value as EngineChoice)}
              className="rounded-lg border border-edge bg-surface2 px-2 py-1.5"
            >
              <option value="neural-browser">🧠 Neuronal — MusicGen dans le navigateur</option>
              {replicateAvailable && <option value="replicate">⚡ Neuronal — Replicate (rapide, stéréo)</option>}
              <option value="local">🎛 Synthèse locale (chant + paroles)</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-muted">Style</span>
            <select
              value={genreId}
              onChange={(e) => setGenreId(e.target.value)}
              className="rounded-lg border border-edge bg-surface2 px-2 py-1.5"
            >
              <option value="">
                {detected && detected.score > 0 ? `Auto — ${detected.genre.name}` : "Auto (selon la description)"}
              </option>
              {GENRES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {g.era}
                </option>
              ))}
            </select>
          </label>

          {engine === "local" ? (
            <>
              <label className="flex items-center gap-2">
                <span className="text-muted">Voix</span>
                <select
                  value={instrumental ? "none" : voiceId}
                  onChange={(e) => {
                    if (e.target.value === "none") setInstrumental(true);
                    else {
                      setInstrumental(false);
                      setVoiceId(e.target.value);
                    }
                  }}
                  className="rounded-lg border border-edge bg-surface2 px-2 py-1.5"
                >
                  <option value="museo-default">Lumen (voix Museo)</option>
                  {voices.map((v) => (
                    <option key={v.voiceId} value={v.voiceId}>
                      {v.name} {v.source === "user-recording" ? "· votre voix" : "· designée"}
                    </option>
                  ))}
                  <option value="none">Instrumental</option>
                </select>
              </label>

              {proAvailable && (
                <label className="flex cursor-pointer items-center gap-1.5 text-muted">
                  <input
                    type="checkbox"
                    checked={useProLyrics}
                    onChange={(e) => setUseProLyrics(e.target.checked)}
                  />
                  Paroles par Claude
                </label>
              )}

              <button
                onClick={() => setShowLyrics(!showLyrics)}
                className="text-muted underline-offset-2 hover:text-foreground hover:underline"
              >
                {showLyrics ? "− mes paroles" : "+ mes paroles"}
              </button>
            </>
          ) : (
            <label className="flex items-center gap-2">
              <span className="text-muted">Durée</span>
              <select
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value))}
                className="rounded-lg border border-edge bg-surface2 px-2 py-1.5"
              >
                <option value={10}>10 s</option>
                <option value={15}>15 s</option>
                <option value={20}>20 s</option>
                <option value={30}>30 s</option>
              </select>
            </label>
          )}

          <button
            onClick={generate}
            disabled={!prompt.trim() || !!stage}
            className="ml-auto rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-40"
          >
            {stage ? "Génération…" : "♪ Composer"}
          </button>
        </div>

        {engine === "neural-browser" && !stage && (
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            🧠 Le modèle MusicGen (Meta, open source) tourne dans votre navigateur : premier usage =
            téléchargement unique d&apos;environ 650 Mo (mis en cache), puis 1 à 5 min de calcul selon votre
            machine. Audio neuronal instrumental — pour le chant, utilisez le moteur local ou une clé Replicate.
          </p>
        )}

        {showLyrics && (
          <textarea
            value={customLyrics}
            onChange={(e) => setCustomLyrics(e.target.value)}
            rows={6}
            placeholder={"Collez vos propres paroles (un bloc par section, séparés par une ligne vide) :\n\nCouplet 1…\n\nRefrain…"}
            className="mt-3 w-full resize-y rounded-xl border border-edge bg-surface2 p-3 text-sm outline-none placeholder:text-muted focus:border-accent"
          />
        )}

        {stage && (
          <div className="mt-4 flex items-center gap-3">
            <div className="flex h-6 items-end gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="eq-bar inline-block w-1.5 rounded-full bg-accent"
                  style={{ height: `${10 + (i % 3) * 6}px`, animationDelay: `${i * 0.12}s` }}
                />
              ))}
            </div>
            <span className="text-xs text-muted">
              {engine === "local" ? (
                <>
                  {stage === "écriture" && "Claude écrit les paroles…"}
                  {stage === "composition" && "Le musicologue compose : harmonie, mélodie, rythme…"}
                  {stage === "interprétation" && "Les instruments et la voix enregistrent le morceau…"}
                </>
              ) : neuralProgress ? (
                <>
                  {neuralProgress.phase === "téléchargement" &&
                    `Téléchargement du modèle MusicGen… ${neuralProgress.pct ?? 0}% (une seule fois, ensuite en cache)`}
                  {neuralProgress.phase === "génération" &&
                    `Le réseau de neurones génère l'audio… ${neuralProgress.pct != null ? `${neuralProgress.pct}%` : ""} ${neuralProgress.detail ?? ""}`}
                  {neuralProgress.phase === "décodage" && "Décodage de l'audio…"}
                </>
              ) : (
                "Initialisation du moteur neuronal…"
              )}
            </span>
          </div>
        )}
        {stage && neuralProgress?.pct != null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface2">
            <div className="h-full bg-accent transition-all" style={{ width: `${neuralProgress.pct}%` }} />
          </div>
        )}
        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      </div>

      {!result && !stage && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setPrompt(ex)}
              className="rounded-full border border-edge bg-surface px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {result && (
        <div className="mt-8">
          <SongView
            song={result.song}
            buffer={result.buffer}
            onReplace={(song, buffer) => setResult({ song, buffer })}
          />
        </div>
      )}
    </div>
  );
}
