import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const rows = await sql`
    SELECT id, created_at, origin_iatas, destination_iata,
           outbound_date_from, outbound_date_to, inbound_date_from, inbound_date_to,
           adults, children, max_price_total, label, last_checked_at, last_min_price,
           last_match_found, active, email, notified_at
    FROM price_alerts
    ORDER BY created_at DESC
  `;
  return NextResponse.json({ alerts: rows });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      originIatas,
      destinationIata,
      outboundDateFrom,
      outboundDateTo,
      inboundDateFrom,
      inboundDateTo,
      adults,
      children,
      maxPriceTotal,
      label,
      email
    } = body;

    if (!originIatas?.length || !destinationIata || !maxPriceTotal) {
      return NextResponse.json({ error: 'originIatas, destinationIata y maxPriceTotal son obligatorios' }, { status: 400 });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'El email indicado no parece valido' }, { status: 400 });
    }

    const rows = await sql`
      INSERT INTO price_alerts (
        origin_iatas, destination_iata,
        outbound_date_from, outbound_date_to, inbound_date_from, inbound_date_to,
        adults, children, max_price_total, label, email
      ) VALUES (
        ${originIatas}, ${destinationIata},
        ${outboundDateFrom}, ${outboundDateTo}, ${inboundDateFrom}, ${inboundDateTo},
        ${adults ?? 2}, ${children ?? 0}, ${maxPriceTotal}, ${label ?? null}, ${email ?? null}
      )
      RETURNING id
    `;
    return NextResponse.json({ id: rows[0]?.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
