import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

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

async function fetchAenaDestinations(origin: string): Promise<ParsedDestination[]> {
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
  if (!res.ok) {
    throw new Error(`Aena respondio ${res.status} para ${origin} (${url})`);
  }
  const html = await res.text();
  const parsed = parseDestinationsHtml(html);
  if (parsed.length < 5) {
    throw new Error(`Parseo sospechoso para ${origin}: solo ${parsed.length} destinos. Aena puede haber cambiado el formato.`);
  }
  return parsed;
}

function getSql() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL no configurada');
  return neon(raw);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret') || request.headers.get('x-cron-secret');
  const expected = process.env.AENA_SYNC_SECRET;
  if (expected && secret !== expected && request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const origins = Object.keys(AENA_AIRPORT_SLUGS);
  const sql = getSql();
  const summary: Record<string, number | string> = {};
  let totalDestinations = 0;
  let hadError = false;
  let lastError = '';

  for (const origin of origins) {
    try {
      const dests = await fetchAenaDestinations(origin);
      totalDestinations += dests.length;
      summary[origin] = dests.length;

      const batchSize = 50;
      for (let i = 0; i < dests.length; i += batchSize) {
        const batch = dests.slice(i, i + batchSize);
        const values: string[] = [];
        const params: unknown[] = [];
        batch.forEach((d, idx) => {
          const base = idx * 5;
          values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5})`);
          params.push(origin, d.destIata, d.destName, d.country, d.airlinesRaw);
        });
        const query = `
          INSERT INTO aena_destinations (origin_iata, dest_iata, dest_name, country, airlines_raw)
          VALUES ${values.join(',')}
          ON CONFLICT (origin_iata, dest_iata)
          DO UPDATE SET dest_name = EXCLUDED.dest_name, country = EXCLUDED.country,
                        airlines_raw = EXCLUDED.airlines_raw, scraped_at = now()
        `;
        // @ts-expect-error - neon serverless soporta query parametrizada via sql.query
        await sql.query(query, params);
      }

      const currentIatas = dests.map((d) => d.destIata);
      if (currentIatas.length > 5) {
        await sql`
          DELETE FROM aena_destinations
          WHERE origin_iata = ${origin}
            AND dest_iata NOT IN (SELECT unnest(${currentIatas}::text[]))
        `;
      }
    } catch (err) {
      hadError = true;
      lastError = err instanceof Error ? err.message : String(err);
      summary[origin] = `ERROR: ${lastError}`;
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
