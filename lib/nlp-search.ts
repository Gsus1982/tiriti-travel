export type MetaOrigin = { iata: string; city: string };
export type MetaGroup = { id: string; name: string; country: string };

export type ParsedQuery = {
  originIatas: string[];
  destinationGroupIds: string[];
  outboundDateFrom?: string;
  outboundDateTo?: string;
  inboundDateFrom?: string;
  inboundDateTo?: string;
  outboundNotBeforeHour?: number;
  inboundNotBeforeHour?: number;
  warnings: string[];
};

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const UNSUPPORTED_DESTINATION_ALIASES: Record<string, string> = {
  londres: 'Londres',
  paris: 'Paris',
  roma: 'Roma',
  berlin: 'Berlin',
  amsterdam: 'Amsterdam',
  lisboa: 'Lisboa'
};

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Parser basado en reglas (regex + diccionario), NO es un LLM. Interpreta un
 * subconjunto razonable de frases en espanol para precargar el formulario.
 * No soporta logica condicional compleja del tipo "dia A despues de hora X,
 * si no dia B despues de hora Y": en ese caso amplia el rango de fechas y usa
 * la hora mas permisiva, avisando al usuario para que revise manualmente.
 */
export function parseSearchQuery(
  rawText: string,
  meta: { origins: MetaOrigin[]; groups: MetaGroup[] },
  referenceYearMonth: { year: number; month: number }
): ParsedQuery {
  const text = stripAccents(rawText);
  const warnings: string[] = [];

  const originIatas: string[] = [];
  for (const o of meta.origins) {
    const cityNorm = stripAccents(o.city);
    if (text.includes(cityNorm) || text.includes(o.iata.toLowerCase())) {
      originIatas.push(o.iata);
    }
  }

  const destinationGroupIds: string[] = [];
  for (const g of meta.groups) {
    const nameNorm = stripAccents(g.name);
    const countryNorm = stripAccents(g.country);
    if (text.includes(nameNorm) || text.includes(countryNorm)) {
      destinationGroupIds.push(g.id);
    }
  }
  if (destinationGroupIds.length === 0) {
    for (const [alias, label] of Object.entries(UNSUPPORTED_DESTINATION_ALIASES)) {
      if (text.includes(alias)) {
        warnings.push(
          `Destino "${label}" detectado en el texto pero no esta disponible todavia en la base de datos de TiritiTravel. Anadelo manualmente en Neon o elige otro destino.`
        );
      }
    }
  }

  // FIX (auditoria): antes se extraian TODOS los dias y TODAS las horas del texto completo
  // en dos listas planas, sin saber a que clausula (ida/vuelta) pertenecia cada uno. Eso
  // rompia con frases como "salida el 4 despues de las 18h o si no el 5 a partir de las 8h,
  // regreso no antes de las 12h": el motor asumia que el ULTIMO dia (5) era la vuelta (cuando
  // en realidad ambos dias son alternativas de IDA) y que la hora de vuelta era el MAXIMO
  // global de todas las horas detectadas (18h, cuando la hora de vuelta real era 12h) -- lo
  // que habria descartado vuelos de vuelta perfectamente validos entre las 12h y las 18h.
  // Ahora: se corta el texto en la primera aparicion de una palabra de vuelta y se extraen
  // dias/horas por separado en cada mitad, para que cada dato quede atado a su clausula real.
  const returnMatch = text.match(/(regreso|vuelta|retorno)/);
  const hasReturnKeyword = returnMatch !== null;
  const idaText = returnMatch?.index !== undefined ? text.slice(0, returnMatch.index) : text;
  const vueltaText = returnMatch?.index !== undefined ? text.slice(returnMatch.index) : '';

  function extractDays(segment: string): number[] {
    const matches = Array.from(segment.matchAll(/(?:el|dia)\s+(\d{1,2})\b/g)).map((m) => parseInt(m[1], 10));
    return Array.from(new Set(matches)).sort((a, b) => a - b);
  }
  function extractHours(segment: string): number[] {
    return Array.from(segment.matchAll(/(?:despues de las|a partir de las|no antes de las)\s+(\d{1,2})/g)).map((m) =>
      parseInt(m[1], 10)
    );
  }

  const idaDays = extractDays(idaText);
  const vueltaDays = extractDays(vueltaText);
  const idaHours = extractHours(idaText);
  const vueltaHours = extractHours(vueltaText);

  let outboundDateFrom: string | undefined;
  let outboundDateTo: string | undefined;
  let inboundDateFrom: string | undefined;
  let inboundDateTo: string | undefined;
  let outboundNotBeforeHour: number | undefined;
  let inboundNotBeforeHour: number | undefined;

  const { year, month } = referenceYearMonth;

  if (idaDays.length >= 1) {
    outboundDateFrom = `${year}-${pad2(month)}-${pad2(idaDays[0])}`;
    outboundDateTo = `${year}-${pad2(month)}-${pad2(idaDays[idaDays.length - 1])}`;
    if (idaDays.length > 1) {
      warnings.push(
        `Se detectaron varios dias de ida como alternativas (${idaDays.join(', ')}); se ha interpretado como un RANGO de fechas de ida (del ${idaDays[0]} al ${idaDays[idaDays.length - 1]}). El motor no soporta "dia+hora condicional" exacto (ej. "el 4 despues de las 18h o si no el 5 a partir de las 8h"); si necesitas precision exacta, lanza dos busquedas separadas, una por cada dia con su hora especifica, y compara resultados.`
      );
    }
  }

  if (vueltaDays.length >= 1) {
    inboundDateFrom = `${year}-${pad2(month)}-${pad2(vueltaDays[0])}`;
    inboundDateTo = `${year}-${pad2(month)}-${pad2(vueltaDays[vueltaDays.length - 1])}`;
    if (vueltaDays.length > 1) {
      warnings.push(
        `Se detectaron varios dias de vuelta (${vueltaDays.join(', ')}); se ha interpretado como un RANGO de fechas de vuelta (del ${vueltaDays[0]} al ${vueltaDays[vueltaDays.length - 1]}). Revisa si es correcto.`
      );
    }
  } else if (hasReturnKeyword) {
    warnings.push('Se detecto una condicion de vuelta en el texto pero ningun dia de vuelta explicito; ajusta la fecha de vuelta manualmente.');
  }

  if (idaHours.length >= 1) {
    outboundNotBeforeHour = Math.min(...idaHours);
    if (idaHours.length > 1) {
      warnings.push(
        `Se detectaron varias condiciones de hora de ida (${idaHours.join('h, ')}h); se ha aplicado la hora MAS PERMISIVA (${outboundNotBeforeHour}h) para no descartar opciones validas.`
      );
    }
  }

  if (vueltaHours.length >= 1) {
    inboundNotBeforeHour = Math.min(...vueltaHours);
    if (vueltaHours.length > 1) {
      warnings.push(
        `Se detectaron varias condiciones de hora de vuelta (${vueltaHours.join('h, ')}h); se ha aplicado la hora MAS PERMISIVA (${inboundNotBeforeHour}h).`
      );
    }
  }

  if (originIatas.length === 0) warnings.push('No se ha reconocido ningun aeropuerto de origen en el texto; selecciona manualmente.');
  if (destinationGroupIds.length === 0 && !warnings.some((w) => w.includes('Destino'))) {
    warnings.push('No se ha reconocido ningun destino disponible en el texto; selecciona manualmente.');
  }
  if (!outboundDateFrom) warnings.push('No se ha detectado ninguna fecha de ida; ajusta las fechas manualmente.');

  return {
    originIatas,
    destinationGroupIds,
    outboundDateFrom,
    outboundDateTo,
    inboundDateFrom,
    inboundDateTo,
    outboundNotBeforeHour,
    inboundNotBeforeHour,
    warnings
  };
}
