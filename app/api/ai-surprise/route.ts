import { NextRequest, NextResponse } from 'next/server';
import { pickSurpriseDestinationsWithAI } from '@/lib/ai-surprise';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { originLabels, outboundDateFrom, outboundDateTo, inboundDateFrom, inboundDateTo, realDestinations } = body;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'IA no configurada (falta OPENAI_API_KEY)' }, { status: 503 });
    }
    if (!Array.isArray(realDestinations) || realDestinations.length === 0) {
      return NextResponse.json({ error: 'Sin destinos reales disponibles para elegir' }, { status: 400 });
    }

    const result = await pickSurpriseDestinationsWithAI({
      originLabels: originLabels ?? [],
      outboundDateFrom,
      outboundDateTo,
      inboundDateFrom,
      inboundDateTo,
      realDestinations
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Error interno eligiendo destinos con IA';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
