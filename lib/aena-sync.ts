import { sql } from './db';

export const AENA_AIRPORT_SLUGS: Record<string, string> = {
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

export interface ParsedDestination {
  destIata: string;
  destName: string;
  country: string;
  airlinesRaw: string;
}

function stripAccents(s: string): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

export function parseDestinationsHtml(html: string): ParsedDestination[] {
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

export async function fetchAenaDestinations(origin: string, timeoutMs = 8000): Promise<ParsedDestination[]> {
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
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Aena respondio ${res.status} para ${origin}`);
  const html = await res.text();
  const parsed = parseDestinationsHtml(html);
  if (parsed.length < 5) {
    throw new Error(`Parseo sospechoso para ${origin}: solo ${parsed.length} destinos.`);
  }
  return parsed;
}

/**
 * Inserta TODOS los destinos de un origen en una sola consulta usando
 * UNNEST sobre arrays paralelos, en vez de una consulta por fila.
 */
export async function upsertDestinations(origin: string, dests: ParsedDestination[]): Promise<void> {
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

export async function logSync(origins: string[], total: number, ok: boolean, error?: string): Promise<void> {
  await sql`
    INSERT INTO aena_sync_log (origins_checked, total_destinations, status, error_message)
    VALUES (${origins}, ${total}, ${ok ? 'ok' : 'partial_error'}, ${error ?? null})
  `;
}
