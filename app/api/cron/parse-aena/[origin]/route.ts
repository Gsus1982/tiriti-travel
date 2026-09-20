import { NextResponse } from 'next/server';
import { AENA_AIRPORT_SLUGS, parseStoredPage, upsertDestinations, logSync } from '@/lib/aena-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 10;

// FASE 2 (sesion 19, FIX real de timeout): lee el HTML ya descargado por
// /api/cron/refresh-aena/[origin] (fase 1, una hora antes segun vercel.json) y SOLO lo
// analiza + guarda -- trabajo de CPU puro, sin red de por medio, mucho mas rapido que
// la descarga. Separar esto de la fase 1 es lo que evita el 504
// FUNCTION_INVOCATION_TIMEOUT real que sufria Madrid al hacer descarga+analisis juntos
// en una sola invocacion de 10s.
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
    console.log(`[parse-aena ${origin}] empezando lectura+analisis...`);
    const t0 = Date.now();
    const dests = await parseStoredPage(origin);
    const t1 = Date.now();
    console.log(`[parse-aena ${origin}] lectura+analisis: ${t1 - t0}ms, ${dests.length} destinos -- empezando upsert...`);
    await upsertDestinations(origin, dests);
    const t2 = Date.now();
    console.log(`[parse-aena ${origin}] upsert: ${t2 - t1}ms -- terminado`);
    await logSync([origin], dests.length, true);
    return NextResponse.json({
      ok: true,
      origin,
      phase: 'parse',
      destinations_found: dests.length,
      timing_ms: { read_and_parse: t1 - t0, upsert: t2 - t1 },
      synced_at: new Date().toISOString()
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await logSync([origin], 0, false, `[fase 2: analisis] ${message}`);
    } catch {
      // si ni siquiera se puede loguear, no bloqueamos la respuesta de error
    }
    return NextResponse.json({ ok: false, origin, phase: 'parse', error: message }, { status: 500 });
  }
}
