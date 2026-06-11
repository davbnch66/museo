import { NextRequest, NextResponse } from "next/server";

// Pro audio generation via Replicate (MusicGen). Optional — Museo's local
// engine renders songs without it; this provides a neural-audio alternative.
const MUSICGEN_VERSION = "671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb";

export async function POST(req: NextRequest) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "REPLICATE_API_TOKEN non configuré — le moteur audio local est utilisé." },
      { status: 501 }
    );
  }
  const { prompt, duration = 30 } = await req.json();

  const create = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      version: MUSICGEN_VERSION,
      input: { prompt, duration, model_version: "stereo-large", output_format: "mp3" },
    }),
  });
  if (!create.ok) {
    return NextResponse.json({ error: `Replicate: ${create.status}` }, { status: 502 });
  }
  let prediction = await create.json();

  // Poll until done (max ~4 min).
  for (let i = 0; i < 120 && !["succeeded", "failed", "canceled"].includes(prediction.status); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    prediction = await poll.json();
  }
  if (prediction.status !== "succeeded") {
    return NextResponse.json({ error: `Génération échouée (${prediction.status})` }, { status: 502 });
  }
  // Proxy the audio back (avoids CORS on the delivery URL).
  const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  const audio = await fetch(url);
  if (!audio.ok) {
    return NextResponse.json({ error: "Téléchargement de l'audio échoué." }, { status: 502 });
  }
  return new NextResponse(await audio.arrayBuffer(), {
    headers: { "Content-Type": audio.headers.get("content-type") ?? "audio/mpeg" },
  });
}
