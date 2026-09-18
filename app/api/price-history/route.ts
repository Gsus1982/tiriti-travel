import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const origin = searchParams.get('origin');
    const destination = searchParams.get('destination');
    if (!origin || !destination) {
      return NextResponse.json({ error: 'Faltan origin y destination' }, { status: 400 });
    }

    const rows = (await sql`
      SELECT observed_at, price, currency
      FROM price_history
      WHERE origin_iata = ${origin} AND destination_iata = ${destination}
      ORDER BY observed_at ASC
      LIMIT 200
    `) as { observed_at: string; price: string; currency: string }[];

    return NextResponse.json({
      points: rows.map((r) => ({ date: r.observed_at, price: Number(r.price), currency: r.currency }))
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Historial no disponible todavia' }, { status: 503 });
  }
}
