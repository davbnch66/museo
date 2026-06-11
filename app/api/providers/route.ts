import { NextResponse } from "next/server";

// Reports which pro providers are configured (keys live in .env.local).
export async function GET() {
  return NextResponse.json({
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    replicate: !!process.env.REPLICATE_API_TOKEN,
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
  });
}
