import { NextResponse } from 'next/server';
import { AENA_AIRPORT_SLUGS } from '@/lib/aena-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Este endpoint YA NO hace la sincronizacion combinada (superaba el limite
 * de 10s de Vercel Hobby). Ahora es solo informativo: indica las URLs
 * individuales por origen, cada una rapida (menos de 8s tipicamente),
 * que es lo que llama el cron automatico configurado en vercel.json.
 */
export async function GET() {
  const origins = Object.keys(AENA_AIRPORT_SLUGS);
  return NextResponse.json({
    info: 'Este endpoint combinado se ha dividido para evitar el timeout de 10s de Vercel. Visita cada uno por separado:',
    endpoints: origins.map((o) => `/api/cron/refresh-aena/${o}`),
  });
}
