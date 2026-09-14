import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username}:***@${u.hostname}${u.pathname}`;
  } catch {
    return 'no-parseable';
  }
}

export async function GET() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return NextResponse.json({ error: 'DATABASE_URL no esta configurada en este entorno de Vercel.' }, { status: 500 });
  }
  try {
    const sql = neon(raw);
    const dbInfo = await sql`SELECT current_database() AS db, current_user AS usr, inet_server_addr()::text AS host`;
    const aenaCounts = await sql`SELECT origin_iata, count(*) AS n FROM aena_destinations GROUP BY origin_iata ORDER BY origin_iata`;
    const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`;
    return NextResponse.json({
      connection_masked: maskUrl(raw),
      database_info: dbInfo[0],
      aena_destinations_counts: aenaCounts,
      tables_visible: tables.map((t: any) => t.table_name)
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
