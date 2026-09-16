export type MetaOrigin = { iata: string; city: string };

export type ParsedQuery = {
  originIatas: string[];
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

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Parser basado en reglas (regex), NO es un LLM -- se usa solo como respaldo si la IA
 * (lib/ai-parse.ts) no esta configurada o falla. Interpreta origenes, fechas y horas
 * en espanol para precargar el formulario. NO intenta detectar destinos: hacer
 * fuzzy-matching fiable por regex contra los cientos de destinos reales de Aena no es
 * razonable (a diferencia de la IA, que si puede razonar sobre nombres/paises/temas) --
 * se avisa al usuario para que elija el destino manualmente en el selector de abajo.
 * Tampoco soporta logica condicional compleja del tipo "dia A despues de hora X, si no
 * dia B despues de hora Y": en ese caso amplia el rango de fechas y usa la hora mas
 * permisiva, avisando al usuario para que revise manualmente.
 */
export function parseSearchQuery(
  rawText: string,
  meta: { origins: MetaOrigin[] },
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
  warnings.push('El destino no se detecta automaticamente con este analizador local (sin IA); elige uno o varios en el selector de destinos reales de abajo.');
  if (!outboundDateFrom) warnings.push('No se ha detectado ninguna fecha de ida; ajusta las fechas manualmente.');

  return {
    originIatas,
    outboundDateFrom,
    outboundDateTo,
    inboundDateFrom,
    inboundDateTo,
    outboundNotBeforeHour,
    inboundNotBeforeHour,
    warnings
  };
}
