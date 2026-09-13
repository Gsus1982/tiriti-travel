import { NextResponse } from 'next/server';
import { listDestinationGroups, listOriginAirports } from '@/lib/search-engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const [groups, origins] = await Promise.all([listDestinationGroups(), listOriginAirports()]);
    return NextResponse.json({ groups, origins });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Error interno obteniendo metadatos';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
