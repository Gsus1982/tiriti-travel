import { NextRequest, NextResponse } from 'next/server';
import { getFreePriceCalendar } from '@/lib/travelpayouts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { origin, destination, yearMonth } = await req.json();
    if (!origin || !destination || !yearMonth) {
      return NextResponse.json({ error: 'Faltan origin, destination y yearMonth' }, { status: 400 });
    }
    if (!process.env.TRAVELPAYOUTS_TOKEN) {
      return NextResponse.json({ error: 'Calendario gratis no configurado (falta TRAVELPAYOUTS_TOKEN)' }, { status: 503 });
    }
    const days = await getFreePriceCalendar(origin, destination, yearMonth);
    return NextResponse.json({ days });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status: 502 });
  }
}
