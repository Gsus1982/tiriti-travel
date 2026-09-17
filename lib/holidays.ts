// Nager.Date -- gratis, sin clave, sin registro. Devuelve festivos publicos por pais y
// ano. Se usa para avisar si las fechas de ida/vuelta coinciden con un festivo (en
// Espana o en el destino), relevante para precio y aglomeracion.
//
// AVISO: no se ha podido verificar contra la API real en esta sesion (sin acceso de red
// a date.nager.at desde este entorno) -- escrito contra la documentacion oficial
// (https://date.nager.at/swagger).

export type Holiday = { date: string; localName: string; countryIso2: string };

const holidayCache = new Map<string, Holiday[] | null>();

async function fetchHolidaysForYear(countryIso2: string, year: number): Promise<Holiday[] | null> {
  const cacheKey = `${countryIso2}-${year}`;
  if (holidayCache.has(cacheKey)) return holidayCache.get(cacheKey)!;
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryIso2}`, {
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) {
      holidayCache.set(cacheKey, null);
      return null;
    }
    const data = (await res.json()) as { date: string; localName: string }[];
    const result = data.map((h) => ({ date: h.date, localName: h.localName, countryIso2 }));
    holidayCache.set(cacheKey, result);
    return result;
  } catch {
    holidayCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Festivos (de un pais) que caen DENTRO del rango de fechas dado (inclusive). Cachea en
 * memoria por proceso -- best-effort, nunca debe romper una busqueda si Nager.Date falla
 * o esta lento.
 */
export async function getHolidaysInRange(countryIso2: string, dateFrom: string, dateTo: string): Promise<Holiday[]> {
  const yearFrom = Number(dateFrom.slice(0, 4));
  const yearTo = Number(dateTo.slice(0, 4));
  const years = yearFrom === yearTo ? [yearFrom] : [yearFrom, yearTo];

  const all = (await Promise.all(years.map((y) => fetchHolidaysForYear(countryIso2, y)))).flat().filter(Boolean) as Holiday[];
  return all.filter((h) => h.date >= dateFrom && h.date <= dateTo);
}
