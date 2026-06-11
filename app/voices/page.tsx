"use client";

// Voice Lab: design original voices, or lend your own voice (with explicit
// consent) so Museo sings in your register and timbre.

import { useEffect, useRef, useState } from "react";
import type { VoiceConfig } from "@/lib/music/types";
import { designVoice, detectBasePitch, freqToMidi } from "@/lib/voice/analyze";
import { previewVoice } from "@/lib/voice/preview";
import { StoredVoice, db } from "@/lib/store/db";

const CONSENT_TEXT =
  "Je confirme que cette voix est la mienne (ou que j'ai l'autorisation explicite de la personne enregistrée), et je consens à ce que Museo l'analyse et s'en inspire pour chanter mes morceaux. L'enregistrement reste stocké localement sur cet appareil.";

export default function VoicesPage() {
  const [voices, setVoices] = useState<StoredVoice[]>([]);
  const [draft, setDraft] = useState<VoiceConfig | null>(null);

  const refresh = () => void db.listVoices().then(setVoices);
  useEffect(refresh, []);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display mb-2 text-3xl font-bold">Voice Lab</h1>
      <p className="mb-8 text-sm text-muted">
        Museo chante avec une voix de synthèse à formants — un timbre assumé, façon vocodeur. Créez des voix
        originales, ou prêtez la vôtre : elle sera analysée (registre, tessiture) pour que le chant vous
        ressemble.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Designer */}
        <section className="rounded-2xl border border-edge bg-surface p-5">
          <h2 className="font-display mb-1 text-xl font-bold">✦ Voice designer</h2>
          <p className="mb-4 text-xs text-muted">
            Le designer invente des voix originales tout seul — relancez les dés ou affinez les curseurs.
          </p>
          <button
            onClick={() => setDraft(designVoice())}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-black hover:opacity-90"
          >
            🎲 Inventer une voix
          </button>

          {draft && (
            <div className="mt-4 rounded-xl border border-edge bg-surface2 p-4">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="mb-3 w-full rounded-lg border border-edge bg-surface px-2 py-1.5 font-display text-lg font-bold outline-none focus:border-accent"
              />
              <Slider label="Registre" min={48} max={76} value={draft.baseMidi} onChange={(v) => setDraft({ ...draft, baseMidi: v })} />
              <Slider label="Brillance" min={0} max={100} value={Math.round(draft.brightness * 100)} onChange={(v) => setDraft({ ...draft, brightness: v / 100 })} />
              <Slider label="Souffle" min={0} max={100} value={Math.round(draft.breathiness * 100)} onChange={(v) => setDraft({ ...draft, breathiness: v / 100 })} />
              <Slider label="Vibrato" min={0} max={100} value={Math.round((draft.vibratoDepth / 0.8) * 100)} onChange={(v) => setDraft({ ...draft, vibratoDepth: (v / 100) * 0.8 })} />
              <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                Caractère
                <select
                  value={draft.gender}
                  onChange={(e) => setDraft({ ...draft, gender: e.target.value as VoiceConfig["gender"] })}
                  className="rounded-lg border border-edge bg-surface px-2 py-1"
                >
                  <option value="feminine">Féminin</option>
                  <option value="masculine">Masculin</option>
                  <option value="neutral">Neutre</option>
                  <option value="ethereal">Éthéré</option>
                </select>
              </label>
              <div className="mt-4 flex gap-2">
                <button onClick={() => void previewVoice(draft)} className="rounded-lg border border-edge px-3 py-1.5 text-xs hover:bg-surface">
                  ▶ Écouter
                </button>
                <button
                  onClick={async () => {
                    await db.saveVoice({ ...draft, createdAt: Date.now() });
                    setDraft(null);
                    refresh();
                  }}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-black hover:opacity-90"
                >
                  ＋ Garder cette voix
                </button>
              </div>
            </div>
          )}
        </section>

        <RecordSection onSaved={refresh} />
      </div>

      {/* Voice list */}
      <section className="mt-8">
        <h2 className="font-display mb-3 text-xl font-bold">Mes voix</h2>
        {voices.length === 0 && <p className="text-sm text-muted">Aucune voix enregistrée — Lumen, la voix par défaut, chante en attendant.</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {voices.map((v) => (
            <div key={v.voiceId} className="rounded-xl border border-edge bg-surface p-4">
              <div className="flex items-start justify-between">
                <h3 className="font-display font-bold">{v.name}</h3>
                <button onClick={async () => { await db.deleteVoice(v.voiceId); refresh(); }} className="text-xs text-muted hover:text-red-400">✕</button>
              </div>
              <p className="mt-1 text-xs text-muted">
                {v.source === "user-recording" ? "Inspirée de votre voix (consentement accordé)" : "Voix designée"} ·{" "}
                {{ feminine: "féminin", masculine: "masculin", neutral: "neutre", ethereal: "éthéré" }[v.gender]}
              </p>
              <button onClick={() => void previewVoice(v)} className="mt-3 rounded-lg border border-edge px-3 py-1.5 text-xs hover:bg-surface2">
                ▶ Écouter
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Slider({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="mb-2 flex items-center gap-3 text-xs text-muted">
      <span className="w-16">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(parseInt(e.target.value))} className="flex-1" />
    </label>
  );
}

function RecordSection({ onSaved }: { onSaved: () => void }) {
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [analysis, setAnalysis] = useState<{ midi: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = async () => {
    setError(null);
    setBlob(null);
    setAnalysis(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const b = new Blob(chunksRef.current, { type: rec.mimeType });
        setBlob(b);
        const pitch = await detectBasePitch(b);
        if (pitch) setAnalysis({ midi: freqToMidi(pitch) });
        else setError("Impossible de détecter la hauteur — chantez ou parlez plus fort, plus longtemps.");
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      setError("Accès au micro refusé.");
    }
  };

  const stop = () => {
    recRef.current?.stop();
    setRecording(false);
  };

  const save = async () => {
    if (!blob || !analysis) return;
    setSaving(true);
    const voiceId = `user_${Date.now().toString(36)}`;
    const midi = analysis.midi;
    const voice: StoredVoice = {
      voiceId,
      name: "Ma voix",
      baseMidi: Math.min(76, Math.max(48, midi + 12 <= 76 && midi < 52 ? midi + 12 : midi)),
      brightness: 0.55,
      breathiness: 0.3,
      vibratoHz: 5,
      vibratoDepth: 0.3,
      gender: midi >= 62 ? "feminine" : midi <= 55 ? "masculine" : "neutral",
      source: "user-recording",
      consent: { granted: true, date: new Date().toISOString(), statement: CONSENT_TEXT },
      createdAt: Date.now(),
      recordingKey: `rec:${voiceId}`,
    };
    await db.saveMedia(`rec:${voiceId}`, blob);
    await db.saveVoice(voice);
    setSaving(false);
    setBlob(null);
    setAnalysis(null);
    setConsent(false);
    onSaved();
  };

  return (
    <section className="rounded-2xl border border-edge bg-surface p-5">
      <h2 className="font-display mb-1 text-xl font-bold">◉ Ma propre voix</h2>
      <p className="mb-3 text-xs text-muted">
        Enregistrez 10–20 secondes (chantez quelques notes ou lisez un texte). Museo détecte votre registre et
        accorde la voix de chant sur votre tessiture.
      </p>
      <label className="mb-4 flex items-start gap-2 rounded-xl border border-edge bg-surface2 p-3 text-xs leading-relaxed text-muted">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        <span>{CONSENT_TEXT}</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {!recording ? (
          <button
            onClick={start}
            disabled={!consent}
            className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40"
          >
            ● Enregistrer
          </button>
        ) : (
          <button onClick={stop} className="animate-pulse rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">
            ■ Stop
          </button>
        )}
        {blob && analysis && (
          <>
            <span className="text-xs text-muted">
              Registre détecté : note MIDI {analysis.midi} —{" "}
              {analysis.midi >= 62 ? "tessiture aiguë" : analysis.midi <= 55 ? "tessiture grave" : "tessiture médium"}
            </span>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-40"
            >
              {saving ? "…" : "＋ Créer ma voix"}
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        Sans consentement coché, l&apos;enregistrement est impossible. Pour un vrai clonage vocal neuronal,
        ajoutez une clé ElevenLabs dans les réglages — le même parcours de consentement s&apos;applique.
      </p>
    </section>
  );
}
