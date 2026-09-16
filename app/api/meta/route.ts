import { NextResponse } from 'next/server';
import { listOriginAirports } from '@/lib/meta-queries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const origins = await listOriginAirports();
    return NextResponse.json({ origins });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Error interno obteniendo metadatos';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
