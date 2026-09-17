import { NextResponse } from 'next/server';
import { getIgnavUsageSummary } from '@/lib/ignav-usage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const summary = await getIgnavUsageSummary();
    return NextResponse.json(summary);
  } catch (err) {
    console.error(err);
    // Si la tabla ignav_usage_log todavia no existe (migracion no aplicada), no
    // rompemos nada -- simplemente no hay contador que mostrar todavia.
    return NextResponse.json({ error: 'Contador de cuota no disponible todavia' }, { status: 503 });
  }
}
