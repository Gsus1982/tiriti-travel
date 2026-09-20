import { NextResponse } from 'next/server';
import { AENA_AIRPORT_SLUGS, fetchAndStoreRawPage, logSync } from '@/lib/aena-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 10;

// FASE 1 (sesion 19, FIX real de timeout): SOLO descarga y guarda el HTML en bruto --
// ya no analiza nada aqui. Antes, esta misma funcion hacia descarga + analisis juntos,
// lo que superaba el limite duro de 10s de Vercel Hobby para Madrid (pagina mucho mas
// grande, 226 destinos) -- confirmado con un 504 FUNCTION_INVOCATION_TIMEOUT real. El
// analisis ahora vive en /api/cron/parse-aena/[origin], programado 1 hora despues en
// vercel.json para garantizar que esta fase ya termino.
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
    const { bytes, diagnostico } = await fetchAndStoreRawPage(origin, 6000);
    return NextResponse.json({
      ok: true,
      origin,
      phase: 'fetch',
      bytes_downloaded: bytes,
      diagnostico,
      fetched_at: new Date().toISOString()
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await logSync([origin], 0, false, `[fase 1: descarga] ${message}`);
    } catch {
      // si ni siquiera se puede loguear, no bloqueamos la respuesta de error
    }
    return NextResponse.json({ ok: false, origin, phase: 'fetch', error: message }, { status: 500 });
  }
}
