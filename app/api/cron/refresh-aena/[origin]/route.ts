import { NextResponse } from 'next/server';
import { AENA_AIRPORT_SLUGS, fetchAenaDestinations, upsertDestinations, logSync } from '@/lib/aena-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 10;

export async function GET(request: Request, { params }: { params: { origin: string } }) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret') || request.headers.get('x-cron-secret');
  const expected = process.env.AENA_SYNC_SECRET;
  if (expected && secret !== expected && request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const origin = params.origin?.toUpperCase();
  if (!origin || !AENA_AIRPORT_SLUGS[origin]) {
    return NextResponse.json(
      { error: `Origen no soportado: ${params.origin}. Usa uno de: ${Object.keys(AENA_AIRPORT_SLUGS).join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const dests = await fetchAenaDestinations(origin, 8000);
    await upsertDestinations(origin, dests);
    await logSync([origin], dests.length, true);
    return NextResponse.json({ ok: true, origin, destinations_found: dests.length, synced_at: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await logSync([origin], 0, false, message);
    } catch {
      // si ni siquiera se puede loguear, no bloqueamos la respuesta de error
    }
    return NextResponse.json({ ok: false, origin, error: message }, { status: 500 });
  }
}
