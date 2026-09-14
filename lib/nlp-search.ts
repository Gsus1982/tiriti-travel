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

  const dayMatches = Array.from(text.matchAll(/(?:el|dia)\s+(\d{1,2})\b/g)).map((m) => parseInt(m[1], 10));
  const uniqueDays = Array.from(new Set(dayMatches)).sort((a, b) => a - b);

  const hourMatches = Array.from(text.matchAll(/(?:despues de las|a partir de las|no antes de las)\s+(\d{1,2})/g)).map((m) =>
    parseInt(m[1], 10)
  );

  let outboundDateFrom: string | undefined;
  let outboundDateTo: string | undefined;
  let inboundDateFrom: string | undefined;
  let inboundDateTo: string | undefined;
  let outboundNotBeforeHour: number | undefined;
  let inboundNotBeforeHour: number | undefined;

  const hasReturnKeyword = /(regreso|vuelta|retorno)/.test(text);

  if (uniqueDays.length >= 1) {
    const { year, month } = referenceYearMonth;
    if (hasReturnKeyword && uniqueDays.length >= 2) {
      outboundDateFrom = `${year}-${pad2(month)}-${pad2(uniqueDays[0])}`;
      outboundDateTo = outboundDateFrom;
      inboundDateFrom = `${year}-${pad2(month)}-${pad2(uniqueDays[uniqueDays.length - 1])}`;
      inboundDateTo = inboundDateFrom;
    } else {
      outboundDateFrom = `${year}-${pad2(month)}-${pad2(uniqueDays[0])}`;
      outboundDateTo = `${year}-${pad2(month)}-${pad2(uniqueDays[uniqueDays.length - 1])}`;
      if (uniqueDays.length > 1) {
        warnings.push(
          `Se detectaron varios dias de ida (${uniqueDays.join(', ')}) sin una fecha de vuelta explicita separada; se ha interpretado como un RANGO de fechas de ida (del ${uniqueDays[0]} al ${uniqueDays[uniqueDays.length - 1]}). Revisa las fechas de vuelta manualmente.`
        );
      }
    }
  }

  if (hourMatches.length >= 1) {
    if (hourMatches.length >= 2) {
      const minHour = Math.min(...hourMatches);
      const maxHour = Math.max(...hourMatches);
      warnings.push(
        `Se detectaron varias condiciones de hora (${hourMatches.join('h, ')}h). El motor no soporta "dia+hora condicional" exacto; se ha aplicado la hora MAS PERMISIVA (${minHour}h) al rango de ida para no descartar opciones validas. Si necesitas precision exacta, lanza dos busquedas por separado: una para cada dia con su hora especifica, y compara resultados.`
      );
      outboundNotBeforeHour = minHour;
      if (hasReturnKeyword) inboundNotBeforeHour = maxHour;
    } else if (hasReturnKeyword && !uniqueDays.length) {
      inboundNotBeforeHour = hourMatches[0];
    } else {
      outboundNotBeforeHour = hourMatches[0];
    }
  }

  if (originIatas.length === 0) warnings.push('No se ha reconocido ningun aeropuerto de origen en el texto; selecciona manualmente.');
  if (destinationGroupIds.length === 0 && !warnings.some((w) => w.includes('Destino'))) {
    warnings.push('No se ha reconocido ningun destino disponible en el texto; selecciona manualmente.');
  }
  if (!outboundDateFrom) warnings.push('No se ha detectado ninguna fecha; ajusta las fechas manualmente.');

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
