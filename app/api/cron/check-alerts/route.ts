import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { searchLiveItineraries } from '@/lib/live-engine';
import { sendAlertEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret') || request.headers.get('x-cron-secret');
  const expected = process.env.AENA_SYNC_SECRET;
  if (expected && secret !== expected && request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const alerts = (await sql`SELECT * FROM price_alerts WHERE active = TRUE`) as any[];
  const summary: { id: number; status: string; minPrice?: number; emailSent?: boolean }[] = [];

  for (const alert of alerts) {
    try {
      const { itineraries } = await searchLiveItineraries({
        originIatas: alert.origin_iatas,
        destinationIatas: alert.destination_iata ? [alert.destination_iata] : [],
        outboundDateFrom: alert.outbound_date_from,
        outboundDateTo: alert.outbound_date_to,
        inboundDateFrom: alert.inbound_date_from,
        inboundDateTo: alert.inbound_date_to,
        pax: { adults: alert.adults, children: alert.children },
        requireCabinBaggage: false,
        allowOpenJaw: true,
        sortBy: 'price'
      });

      const minPrice = itineraries.length ? Math.min(...itineraries.map((i) => i.totalPrice)) : null;
      const matchFound = minPrice !== null && minPrice <= Number(alert.max_price_total);

      let emailSent = false;
      if (matchFound && alert.email && !alert.notified_at) {
        const currency = itineraries[0]?.currency ?? 'EUR';
        const result = await sendAlertEmail({
          to: alert.email,
          label: alert.label,
          minPrice: minPrice as number,
          currency,
          maxPriceTotal: Number(alert.max_price_total)
        });
        emailSent = result.sent;
      }

      await sql`
        UPDATE price_alerts
        SET last_checked_at = now(),
            last_min_price = ${minPrice},
            last_match_found = ${matchFound},
            notified_at = ${matchFound ? (emailSent ? new Date().toISOString() : alert.notified_at) : null}
        WHERE id = ${alert.id}
      `;
      summary.push({ id: alert.id, status: 'ok', minPrice: minPrice ?? undefined, emailSent });
    } catch (err) {
      summary.push({ id: alert.id, status: `error: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  return NextResponse.json({ checked: alerts.length, summary, checked_at: new Date().toISOString() });
}
