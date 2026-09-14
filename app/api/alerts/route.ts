import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const rows = await sql`
    SELECT id, created_at, origin_iatas, destination_group_id, destination_iata,
           outbound_date_from, outbound_date_to, inbound_date_from, inbound_date_to,
           adults, children, max_price_total, label, last_checked_at, last_min_price,
           last_match_found, active
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
      destinationGroupId,
      destinationIata,
      outboundDateFrom,
      outboundDateTo,
      inboundDateFrom,
      inboundDateTo,
      adults,
      children,
      maxPriceTotal,
      label
    } = body;

    if (!originIatas?.length || (!destinationGroupId && !destinationIata) || !maxPriceTotal) {
      return NextResponse.json(
        { error: 'originIatas, destinationGroupId o destinationIata, y maxPriceTotal son obligatorios' },
        { status: 400 }
      );
    }

    const rows = await sql`
      INSERT INTO price_alerts (
        origin_iatas, destination_group_id, destination_iata,
        outbound_date_from, outbound_date_to, inbound_date_from, inbound_date_to,
        adults, children, max_price_total, label
      ) VALUES (
        ${originIatas}, ${destinationGroupId ?? null}, ${destinationIata ?? null},
        ${outboundDateFrom}, ${outboundDateTo}, ${inboundDateFrom}, ${inboundDateTo},
        ${adults ?? 2}, ${children ?? 0}, ${maxPriceTotal}, ${label ?? null}
      )
      RETURNING id
    `;
    return NextResponse.json({ id: rows[0]?.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
