import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { searchLiveItineraries } from '@/lib/live-engine';
import { sendEmail, buildPriceAlertEmailHtml } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type AlertRow = {
  id: number;
  origin_iatas: string[];
  destination_iata: string;
  outbound_date_from: string;
  outbound_date_to: string;
  inbound_date_from: string;
  inbound_date_to: string;
  adults: number;
  children: number;
  max_price_total: string;
  label: string | null;
  email: string | null;
  notified_at: string | null;
};

export async function GET() {
  // FIX (mismo bug que app/api/alerts/route.ts): esta consulta pedia
  // destination_group_id, columna que nunca existio en price_alerts -- el cron
  // fallaba con un error SQL en cada ejecucion diaria desde que se creo.
  const alerts = (await sql`
    SELECT id, origin_iatas, destination_iata, outbound_date_from, outbound_date_to,
           inbound_date_from, inbound_date_to, adults, children, max_price_total,
           label, email, notified_at
    FROM price_alerts
    WHERE active = TRUE
  `) as AlertRow[];

  const summary: { id: number; status: string; minPrice?: number; notified?: boolean; error?: string }[] = [];

  for (const alert of alerts) {
    try {
      const { itineraries } = await searchLiveItineraries({
        originIatas: alert.origin_iatas,
        destinationGroupIds: [],
        destinationIatas: [alert.destination_iata],
        outboundDateFrom: alert.outbound_date_from,
        outboundDateTo: alert.outbound_date_to,
        inboundDateFrom: alert.inbound_date_from,
        inboundDateTo: alert.inbound_date_to,
        pax: { adults: alert.adults, children: alert.children },
        requireCabinBaggage: false,
        allowOpenJaw: true,
        sortBy: 'price'
      } as any);

      const prices = itineraries.map((it: any) => it.totalPrice).filter((p: number) => typeof p === 'number');
      const minPrice = prices.length ? Math.min(...prices) : null;
      const maxPriceTotal = Number(alert.max_price_total);
      const matchFound = minPrice !== null && minPrice <= maxPriceTotal;

      await sql`
        UPDATE price_alerts
        SET last_checked_at = now(), last_min_price = ${minPrice}, last_match_found = ${matchFound}
        WHERE id = ${alert.id}
      `;

      const alreadyNotifiedRecently =
        alert.notified_at && Date.now() - new Date(alert.notified_at).getTime() < 24 * 60 * 60 * 1000;

      let notified = false;
      if (matchFound && alert.email && !alreadyNotifiedRecently && minPrice !== null) {
        try {
          await sendEmail({
            to: alert.email,
            subject: `¡Bajada de precio! ${alert.destination_iata} desde ${minPrice.toFixed(2)} €`,
            html: buildPriceAlertEmailHtml({
              label: alert.label,
              originIatas: alert.origin_iatas,
              destinationIata: alert.destination_iata,
              minPrice,
              maxPriceTotal,
              outboundDateFrom: alert.outbound_date_from,
              inboundDateFrom: alert.inbound_date_from
            })
          });
          await sql`UPDATE price_alerts SET notified_at = now() WHERE id = ${alert.id}`;
          notified = true;
        } catch (emailErr) {
          console.error(`Error enviando email para alerta ${alert.id}:`, emailErr);
        }
      }

      summary.push({ id: alert.id, status: 'ok', minPrice: minPrice ?? undefined, notified });
    } catch (err) {
      console.error(`Error comprobando alerta ${alert.id}:`, err);
      summary.push({ id: alert.id, status: 'error', error: err instanceof Error ? err.message : 'error desconocido' });
    }
  }

  return NextResponse.json({ checked: alerts.length, summary });
}
