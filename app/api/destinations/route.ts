import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getSql() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL no configurada');
  return neon(raw);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const originsParam = searchParams.get('origins');
    const origins = (originsParam ? originsParam.split(',') : ['ALC', 'MAD', 'VLC', 'RMU'])
      .map((o) => o.trim().toUpperCase())
      .filter(Boolean);

    const sql = getSql();

    const rows = await sql`
      SELECT dest_iata, dest_name, country,
             array_agg(DISTINCT origin_iata ORDER BY origin_iata) AS served_from,
             max(scraped_at) AS last_synced
      FROM aena_destinations
      WHERE origin_iata = ANY(${origins}::text[])
      GROUP BY dest_iata, dest_name, country
      ORDER BY country, dest_name
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
