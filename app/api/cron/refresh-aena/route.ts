import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 10;

const AENA_AIRPORT_SLUGS: Record<string, string> = {
  ALC: 'alicante-elche-miguel-hernandez',
  MAD: 'adolfo-suarez-madrid-barajas',
  VLC: 'valencia',
  RMU: 'internacional-region-de-murcia',
};

const DEST_PATH_BY_ORIGIN: Record<string, string> = {
  ALC: 'aerolineas-y-destinos/destinos-aeropuerto.html',
  MAD: 'aerolineas-y-destinos/destinos-aeropuerto.html',
  VLC: 'aerolineas-destinos/destinos-aeropuerto.html',
  RMU: 'aerolineas-y-destinos/destinos-del-aeropuerto.html',
};

interface ParsedDestination {
  destIata: string;
  destName: string;
  country: string;
  airlinesRaw: string;
}

function stripAccents(s: string): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function parseDestinationsHtml(html: string): ParsedDestination[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&aacute;/g, 'a').replace(/&eacute;/g, 'e').replace(/&iacute;/g, 'i')
    .replace(/&oacute;/g, 'o').replace(/&uacute;/g, 'u').replace(/&ntilde;/g, 'n')
    .replace(/&Ntilde;/g, 'N')
    .replace(/[ \t]+/g, ' ');

  const results: ParsedDestination[] = [];
  const pattern = /([A-Z0-9/.,'\- ]{3,80}?)\s*\(([A-Z]{3})\)\s*\n(?:\s*\n)*\s*Pa[i]s\s+([A-Z /]+?)\s*\n(?:\s*\n)*\s*Aerol[i]neas\s+([^\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const [, name, iata, country, airlines] = m;
    if (!/^[A-Z]{3}$/.test(iata)) continue;
    results.push({
      destIata: iata.trim(),
      destName: stripAccents(name.trim()),
      country: stripAccents(country.trim()),
      airlinesRaw: stripAccents(airlines.trim()).slice(0, 500),
    });
  }
  return results;
}

async function fetchAenaDestinations(origin: string): Promise<{ origin: string; dests: ParsedDestination[]; error?: string }> {
  try {
    const slug = AENA_AIRPORT_SLUGS[origin];
    const path = DEST_PATH_BY_ORIGIN[origin];
    if (!slug || !path) throw new Error(`Origen no soportado: ${origin}`);
    const url = `https://www.aena.es/es/${slug}/${path}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'TiritiTravelSyncBot/1.0 (uso personal, sincronizacion diaria de destinos)',
        'Accept-Language': 'es-ES,es;q=0.9',
      },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Aena respondio ${res.status} para ${origin}`);
    const html = await res.text();
    const parsed = parseDestinationsHtml(html);
    if (parsed.length < 5) {
      throw new Error(`Parseo sospechoso para ${origin}: solo ${parsed.length} destinos.`);
    }
    return { origin, dests: parsed };
  } catch (err) {
    return { origin, dests: [], error: err instanceof Error ? err.message : String(err) };
  }
}

async function upsertDestinations(origin: string, dests: ParsedDestination[]): Promise<void> {
  if (dests.length === 0) return;
  const destIatas = dests.map((d) => d.destIata);
  const destNames = dests.map((d) => d.destName);
  const countries = dests.map((d) => d.country);
  const airlines = dests.map((d) => d.airlinesRaw);

  await sql`
    INSERT INTO aena_destinations (origin_iata, dest_iata, dest_name, country, airlines_raw)
    SELECT ${origin}, u.dest_iata, u.dest_name, u.country, u.airlines_raw
    FROM unnest(${destIatas}::text[], ${destNames}::text[], ${countries}::text[], ${airlines}::text[])
      AS u(dest_iata, dest_name, country, airlines_raw)
    ON CONFLICT (origin_iata, dest_iata)
    DO UPDATE SET dest_name = EXCLUDED.dest_name, country = EXCLUDED.country,
                  airlines_raw = EXCLUDED.airlines_raw, scraped_at = now()
  `;

  await sql`
    DELETE FROM aena_destinations
    WHERE origin_iata = ${origin}
      AND dest_iata NOT IN (SELECT unnest(${destIatas}::text[]))
  `;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret') || request.headers.get('x-cron-secret');
  const expected = process.env.AENA_SYNC_SECRET;
  if (expected && secret !== expected && request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const origins = Object.keys(AENA_AIRPORT_SLUGS);

  // Las 4 descargas de Aena se hacen EN PARALELO (no secuenciales), porque
  // el plan gratuito de Vercel limita las funciones serverless a 10s y
  // 4 peticiones HTTP secuenciales a un sitio externo pueden superar eso
  // facilmente (causa real del 504 detectado en produccion).
  const fetchResults = await Promise.all(origins.map((o) => fetchAenaDestinations(o)));

  const summary: Record<string, number | string> = {};
  let totalDestinations = 0;
  let hadError = false;
  let lastError = '';

  for (const result of fetchResults) {
    if (result.error) {
      hadError = true;
      lastError = result.error;
      summary[result.origin] = `ERROR: ${result.error}`;
      continue;
    }
    totalDestinations += result.dests.length;
    summary[result.origin] = result.dests.length;
    try {
      await upsertDestinations(result.origin, result.dests);
    } catch (err) {
      hadError = true;
      lastError = err instanceof Error ? err.message : String(err);
      summary[result.origin] = `ERROR al guardar: ${lastError}`;
    }
  }

  await sql`
    INSERT INTO aena_sync_log (origins_checked, total_destinations, status, error_message)
    VALUES (${origins}, ${totalDestinations}, ${hadError ? 'partial_error' : 'ok'}, ${hadError ? lastError : null})
  `;

  return NextResponse.json({
    ok: !hadError,
    summary,
    total_destinations: totalDestinations,
    synced_at: new Date().toISOString(),
  });
}
