import { NextRequest, NextResponse } from 'next/server';
import { buildPriceCalendar } from '@/lib/price-calendar';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { origin, destination, dateFrom, dateTo, adults, children } = body;
    if (!origin || !destination || !dateFrom || !dateTo) {
      return NextResponse.json({ error: 'origin, destination, dateFrom y dateTo son obligatorios' }, { status: 400 });
    }
    const { days, warnings } = await buildPriceCalendar({
      origin,
      destination,
      dateFrom,
      dateTo,
      adults: adults ?? 2,
      children: children ?? 0
    });
    return NextResponse.json({ days, warnings });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
