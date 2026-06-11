import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Pro lyric generation via Claude. Falls back to Museo's local lyric engine
// client-side when no key is configured (this route then returns 501).
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY non configurée — le moteur de paroles local sera utilisé." },
      { status: 501 }
    );
  }
  const { prompt, genre, structure, language, title } = await req.json();

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system:
      "Tu es un parolier professionnel. Tu écris des paroles de chansons originales, évocatrices et chantables, parfaitement adaptées au genre demandé. Réponds UNIQUEMENT en JSON valide, sans markdown.",
    messages: [
      {
        role: "user",
        content: `Écris les paroles d'une chanson.
Titre : ${title}
Description : ${prompt}
Genre : ${genre}
Langue : ${language === "en" ? "anglais" : "français"}
Structure attendue (types de sections, dans l'ordre) : ${JSON.stringify(structure)}

Réponds en JSON: {"sections": [{"type": "<type de section>", "lines": ["...", "..."]}]}
Contraintes : couplets 4 lignes, refrains 4 lignes (identiques à chaque refrain, avec un hook mémorable), prechorus/bridge 2 lignes, lignes de 6 à 11 syllabes, rimes naturelles. Pas de lignes pour intro/outro/solo.`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    return NextResponse.json({ error: "Génération refusée." }, { status: 502 });
  }
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  try {
    const json = JSON.parse(text.replace(/^```json?\s*|\s*```$/g, ""));
    return NextResponse.json(json);
  } catch {
    return NextResponse.json({ error: "Réponse non parsable." }, { status: 502 });
  }
}
