import { NextRequest, NextResponse } from "next/server";

// Pro voice features via ElevenLabs: clone the user's (consented) voice or
// design a brand-new one. Optional — the local formant singer works without it.
export async function POST(req: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY non configurée — la voix de synthèse locale est utilisée." },
      { status: 501 }
    );
  }

  const form = await req.formData();
  const action = form.get("action");

  if (action === "clone") {
    const consent = form.get("consent");
    if (consent !== "true") {
      return NextResponse.json({ error: "Consentement explicite requis pour cloner une voix." }, { status: 403 });
    }
    const name = (form.get("name") as string) ?? "Ma voix Museo";
    const audio = form.get("audio") as File | null;
    if (!audio) return NextResponse.json({ error: "Enregistrement audio manquant." }, { status: 400 });

    const out = new FormData();
    out.append("name", name);
    out.append("files", audio, "sample.webm");
    const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": key },
      body: out,
    });
    if (!res.ok) return NextResponse.json({ error: `ElevenLabs: ${res.status}` }, { status: 502 });
    const json = await res.json();
    return NextResponse.json({ voiceId: json.voice_id });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
