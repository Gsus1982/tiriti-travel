import { NextRequest, NextResponse } from 'next/server';
import { parseSearchQueryWithAI } from '@/lib/ai-parse';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, referenceDate, origins, realDestinations } = body;
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Falta el texto a interpretar' }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'IA no configurada (falta OPENAI_API_KEY)' }, { status: 503 });
    }

    const result = await parseSearchQueryWithAI(text, {
      referenceDate,
      origins: origins ?? [],
      realDestinations: realDestinations ?? []
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Error interno interpretando con IA';
    // 502: fallo de la IA (o de su parseo), no del propio servidor -- el cliente cae al
    // parser de regex local ante cualquier error, nunca deja al usuario sin nada.
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
