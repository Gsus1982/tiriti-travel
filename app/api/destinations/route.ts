import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const originsParam = searchParams.get('origins');
    const origins = (originsParam ? originsParam.split(',') : ['ALC', 'MAD', 'VLC', 'RMU'])
      .map((o) => o.trim().toUpperCase())
      .filter(Boolean);

    // FIX (v0.30.2, bug real reportado con captura): antes se agrupaba por
    // (dest_iata, dest_name, country). Cada origen se sincroniza con Aena en
    // sesiones distintas y no todas las paginas de Aena traen el pais por fila --
    // Madrid (236 destinos) y Valencia (109 destinos) se resincronizaron el 21-09
    // con country vacio, mientras que Alicante (sincronizado el 14-09) si lo trae.
    // Como el pais formaba parte de la clave de agrupacion, el MISMO aeropuerto (ej.
    // KTW, servido desde ALC y desde MAD) aparecia como 2 filas distintas en el
    // selector: una con pais y otra sin el. Confirmado contra la base de datos real
    // (Neon): afecta a decenas de destinos, no solo a Katowice (Amsterdam, Atenas,
    // Barcelona, Berlin, Cracovia, Dublin...). Ahora se agrupa SOLO por (dest_iata,
    // dest_name) y se elige, de entre todas las filas del grupo, el primer valor de
    // country que no este vacio.
    const rows = await sql`
      SELECT dest_iata, dest_name,
             (array_agg(country) FILTER (WHERE country IS NOT NULL AND country <> ''))[1] AS country,
             array_agg(DISTINCT origin_iata ORDER BY origin_iata) AS served_from,
             max(scraped_at) AS last_synced
      FROM aena_destinations
      WHERE origin_iata = ANY(${origins}::text[])
      GROUP BY dest_iata, dest_name
      ORDER BY country NULLS LAST, dest_name
    `;

    const lastSyncRows = await sql`
      SELECT run_at, status, total_destinations
      FROM aena_sync_log
      ORDER BY run_at DESC
      LIMIT 1
    `;

    return NextResponse.json({
      origins,
      count: rows.length,
      destinations: rows,
      last_sync: lastSyncRows[0] ?? null,
      source: 'aena_destinations_cache',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
