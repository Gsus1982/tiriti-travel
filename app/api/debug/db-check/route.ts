import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const dbInfo = await sql`SELECT current_database() AS db, current_user AS usr`;
    const aenaCounts = await sql`SELECT origin_iata, count(*) AS n FROM aena_destinations GROUP BY origin_iata ORDER BY origin_iata`;
    const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
    return NextResponse.json({
      database_info: dbInfo[0],
      aena_destinations_counts: aenaCounts,
      tables_visible: tables.map((t: any) => t.table_name)
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
