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
// Pares mojibake -> caracter correcto para los caracteres especiales del español,
// generados a partir de sus bytes UTF-8 reales reinterpretados como latin1 (verificado
// programaticamente, no adivinado a mano). Cubre minusculas, mayusculas, dieresis y
// los signos de apertura ¿¡.

/**
 * FIX real (sesion 26, cuarto intento): la lista fija de 16 pares (sesion 25) deberia
 * haber coincidido con el texto real reportado por el usuario (verificado que
 * `textoReal.includes('\u00c3\u00a1')` daba `true` en una prueba directa), pero el
 * problema seguia sin resolverse en produccion -- señal de que el fallo no estaba en
 * el PATRON en si, sino en algun otro punto de la cadena (por eso esta sesion añade
 * tambien diagnostico de "antes de guardar" vs "leido de vuelta" en
 * `fetchAndStoreRawPage`, para localizarlo con certeza). Aun así, se sustituye la
 * lista fija por un metodo ALGORITMICO mas robusto y general: en vez de una lista
 * cerrada de pares exactos, reconoce el PATRON ESTRUCTURAL de cualquier secuencia de 2
 * caracteres que sea una secuencia UTF-8 de 2 bytes (bloque Latin-1 Supplement
 * completo, no solo las letras españolas) mal interpretada como latin1 -- byte lider
 * UTF-8 (0xC2 o 0xC3) seguido de un byte de continuacion (0x80-0xBF) -- y la decodifica
 * correctamente byte a byte. Con salvaguarda POR COINCIDENCIA INDIVIDUAL (no global):
 * si una coincidencia concreta no produce un unico caracter valido al decodificar, esa
 * coincidencia en concreto se deja intacta, sin afectar al resto del texto.
 */
function fixDoubleEncodedUtf8(text: string): string {
  return text.replace(/[\u00c2\u00c3][\u0080-\u00bf]/g, (match) => {
    const decoded = Buffer.from(match, 'latin1').toString('utf-8');
    return decoded.length === 1 && decoded !== '\uFFFD' ? decoded : match;
  });
}

function stripUnneededHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(header|footer|nav)\b[\s\S]*?<\/\1>/gi, ' ');
}

export async function fetchAndStoreRawPage(
  origin: string,
  timeoutMs = 6000
): Promise<{
  bytes: number;
  diagnostico?: { contexto_html_crudo_alrededor_de_LCG: string; lineas_alrededor_de_LCG: string[] };
}> {
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

    // Diagnostico (sesion 29): el diagnostico de la sesion 27 (buscar el caracter
    // mojibake U+00C3) devolvio "no encontrado" -- es decir, el texto NUNCA tuvo el
    // problema de codificacion que se llevaba investigando desde la sesion 23 (lo que
    // se veia como "SuÃ¡rez" en las respuestas JSON probablemente era solo el
    // navegador del usuario mostrando mal el JSON en pantalla, no un problema real en
    // los datos). Pivote de investigacion: si la codificacion esta bien, el "0
    // destinos" real tiene que ser un problema de ESTRUCTURA -- el patron esperado
    // (Nombre (IATA) / Pais X / Aerolineas Y en lineas separadas) puede no encajar con
    // la disposicion real del HTML de Madrid. Se busca un destino que SI sabemos que
    // esta ahi ("(LCG)", A Coruña, visto en busquedas anteriores) y se muestra el
    // contexto real, con etiquetas y ya convertido a lineas, para ver la estructura
    // de verdad en vez de seguir suponiendo.
    const marker = '(LCG)';
    const rawIdx = rawHtml.indexOf(marker);
    const rawContext = rawIdx >= 0 ? rawHtml.slice(Math.max(0, rawIdx - 300), rawIdx + 100) : `(no se encontro "${marker}" en el HTML crudo)`;

    const lines = html
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const lineIdx = lines.findIndex((l) => l.includes(marker.replace(/[()]/g, '')));
    const linesContext = lineIdx >= 0 ? lines.slice(Math.max(0, lineIdx - 3), lineIdx + 6) : [`(no se encontro "LCG" en ninguna linea, hay ${lines.length} lineas en total)`];

    await sql`
      INSERT INTO aena_raw_pages (origin_iata, html, fetched_at)
      VALUES (${origin}, ${html}, now())
      ON CONFLICT (origin_iata) DO UPDATE SET html = EXCLUDED.html, fetched_at = EXCLUDED.fetched_at
    `;

    return {
      bytes: html.length,
      diagnostico: {
        contexto_html_crudo_alrededor_de_LCG: rawContext,
        lineas_alrededor_de_LCG: linesContext
      }
    };
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
