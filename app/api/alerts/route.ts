import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

type Body = {
  originIatas?: string[];
  destinationIata?: string;
  outboundDateFrom?: string;
  outboundDateTo?: string;
  inboundDateFrom?: string;
  inboundDateTo?: string;
  adults?: number;
  children?: number;
  maxPriceTotal?: number;
  label?: string;
  email?: string;
};

export async function GET() {
  try {
    // FIX: esta consulta pedia `destination_group_id`, una columna que NUNCA ha
    // existido en la tabla real de Neon (verificado directamente contra la BD) --
    // cualquier llamada a este endpoint fallaba con un error SQL desde que se creo.
    // La tabla solo soporta un destino real concreto (destination_iata), no un grupo
    // curado por tema.
    const rows = await sql`
      SELECT id, created_at, origin_iatas, destination_iata,
             outbound_date_from, outbound_date_to, inbound_date_from, inbound_date_to,
             adults, children, max_price_total, label, email, last_checked_at,
             last_min_price, last_match_found, notified_at, active
      FROM price_alerts
      ORDER BY created_at DESC
    `;
    return NextResponse.json({ alerts: rows });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Error interno listando alertas';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
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

    if (!originIatas?.length || !destinationIata || !maxPriceTotal || !outboundDateFrom || !inboundDateFrom) {
      return NextResponse.json(
        {
          error:
            'Faltan campos obligatorios: originIatas, destinationIata, maxPriceTotal, outboundDateFrom, inboundDateFrom'
        },
        { status: 400 }
      );
    }

    const rows = await sql`
      INSERT INTO price_alerts (
        origin_iatas, destination_iata,
        outbound_date_from, outbound_date_to, inbound_date_from, inbound_date_to,
        adults, children, max_price_total, label, email
      ) VALUES (
        ${originIatas}, ${destinationIata},
        ${outboundDateFrom}, ${outboundDateTo ?? outboundDateFrom}, ${inboundDateFrom}, ${inboundDateTo ?? inboundDateFrom},
        ${adults ?? 2}, ${children ?? 0}, ${maxPriceTotal}, ${label ?? null}, ${email ?? null}
      )
      RETURNING id, created_at, origin_iatas, destination_iata, outbound_date_from, outbound_date_to,
                inbound_date_from, inbound_date_to, adults, children, max_price_total, label, email, active
    `;

    return NextResponse.json({ alert: rows[0] }, { status: 201 });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Error interno creando la alerta';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Falta el parametro id' }, { status: 400 });
    }
    await sql`UPDATE price_alerts SET active = FALSE WHERE id = ${Number(id)}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Error interno desactivando la alerta';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
