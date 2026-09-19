import { NextRequest, NextResponse } from 'next/server';
import { getDestinationTips } from '@/lib/ai-destination-tips';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { destinationName, country, month, climate, childrenCount } = await req.json();
    if (!destinationName || !month) {
      return NextResponse.json({ error: 'Faltan destinationName y month' }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'IA no configurada (falta OPENAI_API_KEY)' }, { status: 503 });
    }
    const tips = await getDestinationTips(destinationName, country ?? '', Number(month), climate ?? null, Number(childrenCount ?? 0));
    return NextResponse.json(tips);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status: 502 });
  }
}
