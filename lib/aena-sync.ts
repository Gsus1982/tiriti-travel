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
  // FIX real (sesion 12): esta ruta tenia un "del" de mas ("destinos-del-aeropuerto")
  // que no existe en la web real de Aena -- verificado contra
  // aena.es/en/internacional-region-de-murcia/airlines-and-destinations/airport-destinations.html,
  // cuyo equivalente en español es "aerolineas-y-destinos/destinos-aeropuerto.html",
  // igual que ALC y MAD. Con la ruta mal escrita, Aena devolvia 404 y el origen RMU
  // nunca llegaba a tener NINGUN destino sincronizado -- de ahi el "0 destinos" real
  // reportado, no un hueco de datos que hiciera falta rellenar a mano.
  RMU: 'aerolineas-y-destinos/destinos-aeropuerto.html',
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
  const withoutTags = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&aacute;/g, 'a').replace(/&eacute;/g, 'e').replace(/&iacute;/g, 'i')
    .replace(/&oacute;/g, 'o').replace(/&uacute;/g, 'u').replace(/&ntilde;/g, 'n')
    .replace(/&Ntilde;/g, 'N');

  // FIX real (sesion 19): la lista de arriba solo cubre ENTIDADES HTML concretas
  // (&iacute; etc). La pagina real de Aena usa el caracter UTF-8 literal "í" en
  // "País" -- verificado por busqueda web contra la pagina real de Madrid, que
  // devuelve textualmente "... (LCG) País ESPAÑA · Aerolíneas · IBERIA...". El patron
  // de mas abajo esperaba "Pais" en ASCII puro (Pa[i]s, donde [i] es solo una 'i'
  // normal) y nunca podia reconocer "País" con tilde real. En vez de anadir mas
  // entidades sueltas a la lista de arriba (fragil, un parche por caracter), se quitan
  // TODOS los acentos del texto entero de una vez con el mismo stripAccents() que ya
  // se usaba solo para limpiar la salida -- asi da igual si Aena sirve el acento como
  // entidad HTML o como caracter UTF-8 literal, en esta pagina o en cualquier otra.
  const text = stripAccents(withoutTags).replace(/[ \t]+/g, ' ');

  const results: ParsedDestination[] = [];
  const pattern = /([A-Z0-9/.,'\- ]{3,80}?)\s*\(([A-Z]{3})\)\s*\n(?:\s*\n)*\s*Pa[i]s\s+([A-Z /]+?)\s*\n(?:\s*\n)*\s*Aerol[i]neas\s+([^\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const [, name, iata, country, airlines] = m;
    if (!/^[A-Z]{3}$/.test(iata)) continue;
    results.push({
      destIata: iata.trim(),
      destName: name.trim(),
      country: country.trim(),
      airlinesRaw: airlines.trim().slice(0, 500),
    });
  }
  return results;
}

function withHardTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout duro de ${ms}ms alcanzado en ${label}`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

export async function fetchAenaDestinations(origin: string, timeoutMs = 5000): Promise<ParsedDestination[]> {
  const slug = AENA_AIRPORT_SLUGS[origin];
  const path = DEST_PATH_BY_ORIGIN[origin];
  if (!slug || !path) throw new Error(`Origen no soportado: ${origin}`);
  const url = `https://www.aena.es/es/${slug}/${path}`;

  // Doble proteccion: AbortSignal.timeout() aborta la conexion HTTP, y
  // withHardTimeout() garantiza que la promesa se resuelve/rechaza igual
  // aunque el abort no se propague a tiempo (defensivo ante posibles
  // bloqueos de red silenciosos de Aena hacia IPs de datacenter).
  const doFetch = async () => {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TiritiTravelSyncBot/1.0; +uso personal)',
        'Accept-Language': 'es-ES,es;q=0.9',
        Accept: 'text/html',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Aena respondio ${res.status} para ${origin}`);
    const html = await res.text();
    const parsed = parseDestinationsHtml(html);
    if (parsed.length < 5) {
      throw new Error(`Parseo sospechoso para ${origin}: solo ${parsed.length} destinos (posible bloqueo o cambio de formato de Aena).`);
    }
    return parsed;
  };

  return withHardTimeout(doFetch(), timeoutMs + 500, `fetch Aena ${origin}`);
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
