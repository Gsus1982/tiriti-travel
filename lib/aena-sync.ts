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

  // FIX real (sesion 22): antes habia un UNICO regex con cuantificadores perezosos
  // anidados (`{3,80}?`, `+?`, `(?:\s*\n)*`) aplicado a todo el texto de una vez --
  // con una pagina grande (Madrid, 457 KB reales) esto causaba que el analisis por si
  // solo (CPU pura, sin red de por medio) superase el limite duro de 10s de Vercel,
  // aunque una prueba de estres sintetica no llego a reproducir el caso exacto. En vez
  // de seguir ajustando ese regex a ciegas, se sustituye por un metodo LINEAL:
  // dividir por lineas y mirar solo unas pocas lineas siguientes a cada candidato --
  // O(n) real, sin ningun cuantificador perezoso anidado, mucho mas predecible.
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const results: ParsedDestination[] = [];
  const nameIataRe = /^(.{1,80}?)\s*\(([A-Z]{3})\)$/;

  for (let i = 0; i < lines.length; i++) {
    const m = nameIataRe.exec(lines[i]);
    if (!m) continue;
    const [, name, iata] = m;
    if (!/^[A-Z]{3}$/.test(iata)) continue;

    let country: string | null = null;
    let airlines: string | null = null;
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const pm = /^Pa[i]s\s+([A-Z /]+)$/.exec(lines[j]);
      if (pm) {
        country = pm[1].trim();
        continue;
      }
      const am = /^Aerol[i]neas\s+(.+)$/.exec(lines[j]);
      if (am) {
        airlines = am[1].trim();
        break;
      }
    }
    if (country && airlines) {
      results.push({
        destIata: iata.trim(),
        destName: name.trim(),
        country: country.trim(),
        airlinesRaw: airlines.trim().slice(0, 500),
      });
    }
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

/**
 * FASE 1 (sesion 19, FIX real de timeout): solo descarga el HTML en bruto de Aena y lo
 * guarda -- NO analiza nada aqui. Antes, una sola funcion hacia descarga + analisis
 * juntos; para Madrid (226 destinos, pagina mucho mas grande) eso superaba el limite
 * duro de 10s de una funcion en el plan Hobby de Vercel (confirmado con un 504
 * FUNCTION_INVOCATION_TIMEOUT real, reportado por el usuario). Separar en 2
 * invocaciones distintas le da a CADA fase sus propios 10s completos.
 */
/**
 * FIX real (sesion 24, segundo intento tras confirmar con el usuario que el primer fix
 * -- forzar TextDecoder utf-8 -- no bastaba): Aena esta enviando el contenido de esta
 * pagina con DOBLE codificacion UTF-8 desde su propio servidor -- un fallo tipico de
 * mezclar una base de datos en latin1/windows-1252 con una tuberia de salida en UTF-8
 * sin convertir correctamente en algun punto intermedio. Decodificar bien como UTF-8
 * (lo que ya se hacia) da CORRECTAMENTE "Ã¡" para lo que deberia ser "á", porque esos
 * son literalmente los bytes reales que Aena envia por la red -- el problema esta en
 * el lado de Aena, antes de que la peticion llegue aqui.
 *
 * Se deshace reinterpretando el texto ya decodificado como si sus caracteres fueran
 * bytes latin1 (cada caracter del string, valores 0-255, se convierte en 1 byte), y
 * decodificando ESOS bytes como UTF-8 otra vez -- confirmado con una prueba exacta:
 * el texto real observado ("Ã¡", "Ã‘") revierte correctamente a "á", "Ñ" con esta
 * transformacion.
 *
 * Riesgo asumido conscientemente: si el texto tuviera caracteres geniunamente fuera
 * del rango latin1 (por ejemplo, comillas tipograficas o algun caracter no español),
 * esta transformacion los deformaria. Para esta pagina en concreto (nombres de
 * aeropuertos y paises en español) se considera un riesgo aceptable frente al
 * beneficio de arreglar el problema real y mucho mas frecuente (todas las vocales
 * acentuadas y la Ñ).
 */
function fixDoubleEncodedUtf8(text: string): string {
  try {
    const fixed = Buffer.from(text, 'latin1').toString('utf-8');
    // Salvaguarda: si el resultado tiene caracteres de reemplazo (U+FFFD), la
    // transformacion no era valida para este texto -- se descarta y se devuelve el
    // original sin tocar, en vez de arriesgarse a corromper texto que no estaba
    // doblemente codificado.
    return fixed.includes('\uFFFD') ? text : fixed;
  } catch {
    return text;
  }
}

function stripUnneededHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(header|footer|nav)\b[\s\S]*?<\/\1>/gi, ' ');
}

export async function fetchAndStoreRawPage(origin: string, timeoutMs = 6000): Promise<{ bytes: number }> {
  const slug = AENA_AIRPORT_SLUGS[origin];
  const path = DEST_PATH_BY_ORIGIN[origin];
  if (!slug || !path) throw new Error(`Origen no soportado: ${origin}`);
  const url = `https://www.aena.es/es/${slug}/${path}`;

  const doFetchAndStore = async () => {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TiritiTravelSyncBot/1.0; +uso personal)',
        'Accept-Language': 'es-ES,es;q=0.9',
        Accept: 'text/html',
        'Accept-Encoding': 'gzip, br',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Aena respondio ${res.status} para ${origin}`);
    const buffer = await res.arrayBuffer();
    const rawHtml = fixDoubleEncodedUtf8(new TextDecoder('utf-8').decode(buffer));
    const html = stripUnneededHtml(rawHtml);
    await sql`
      INSERT INTO aena_raw_pages (origin_iata, html, fetched_at)
      VALUES (${origin}, ${html}, now())
      ON CONFLICT (origin_iata) DO UPDATE SET html = EXCLUDED.html, fetched_at = EXCLUDED.fetched_at
    `;
    return { bytes: html.length };
  };

  // Limite duro sobre la funcion ENTERA (descarga + limpieza + escritura), no solo
  // sobre la descarga -- 9000ms deja 1s de margen bajo el limite de 10s de Vercel para
  // que el catch de la ruta pueda devolver un JSON de error limpio en vez de que
  // Vercel mate la funcion en crudo (504 sin cuerpo, como le paso al usuario).
  return withHardTimeout(doFetchAndStore(), 9000, `fetch+guardar Aena ${origin}`);
}

/**
 * FASE 2 (una hora despues de la fase 1 en el cron, para garantizar el orden sin
 * depender de la precision de "dentro de la hora" del plan Hobby): lee el HTML ya
 * descargado y SOLO lo analiza + guarda en aena_destinations -- sin red de por medio,
 * es trabajo de CPU puro, mucho mas rapido que descargar la pagina.
 */
export async function parseStoredPage(origin: string): Promise<ParsedDestination[]> {
  const rows = (await sql`SELECT html, length(html) AS len FROM aena_raw_pages WHERE origin_iata = ${origin}`) as {
    html: string;
    len: number;
  }[];
  if (rows.length === 0) {
    throw new Error(`No hay ninguna pagina descargada todavia para ${origin} -- espera a que corra la fase de descarga.`);
  }
  const parsed = parseDestinationsHtml(rows[0].html);
  if (parsed.length < 5) {
    // Diagnostico (sesion 20, tras un fallo real con 0 destinos en Murcia que no se
    // pudo investigar por falta de acceso de red propio a Aena): en vez de solo decir
    // "posible bloqueo", se incluye un extracto real de lo que se descargo -- asi el
    // usuario puede copiarlo y pegarlo para diagnosticar sin que haga falta acceso de
    // red directo a Aena desde ningun otro sitio.
    const plainText = rows[0].html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const snippet = plainText.slice(0, 400);
    throw new Error(
      `Analisis sospechoso para ${origin}: solo ${parsed.length} destinos (posible bloqueo o cambio de formato de Aena). ` +
        `Se descargaron ${rows[0].len} caracteres de HTML. Extracto del contenido real (primeros 400 caracteres de texto, sin etiquetas): "${snippet}"`
    );
  }
  return parsed;
}

/** Version original (descarga + analiza en una sola llamada) -- se mantiene para quien la necesite sin el limite de 10s (pruebas locales, script manual), pero los crons reales ya usan las 2 fases de arriba. */
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
    const html = fixDoubleEncodedUtf8(new TextDecoder('utf-8').decode(await res.arrayBuffer()));
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
