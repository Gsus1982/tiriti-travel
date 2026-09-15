import { NextRequest, NextResponse } from 'next/server';
import { recommendBestItinerary, type SummarizedItinerary } from '@/lib/ai-recommend';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const itineraries = body.itineraries as SummarizedItinerary[];
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'IA no configurada (falta OPENAI_API_KEY)' }, { status: 503 });
    }
    if (!Array.isArray(itineraries) || itineraries.length === 0) {
      return NextResponse.json({ error: 'Sin resultados que recomendar' }, { status: 400 });
    }

    const result = await recommendBestItinerary(itineraries);
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Error interno recomendando';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
