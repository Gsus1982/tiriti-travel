import { getAirportGeo } from './airport-geo';

// Open-Meteo (https://open-meteo.com) -- gratis, sin clave, sin registro, licencia CC
// BY 4.0 (atribucion visible en la interfaz donde se muestre). Se usa el archivo
// HISTORICO (archive-api.open-meteo.com), no el pronostico normal, porque los viajes de
// esta app se planean con semanas/meses de antelacion y un pronostico solo cubre ~16
// dias vista -- en vez de eso, se promedia el clima real de las MISMAS fechas de
// calendario en los ultimos 3 anos, como "clima habitual" orientativo.
//
// AVISO: no se ha podido verificar contra la API real en esta sesion (sin acceso de
// red a open-meteo.com desde este entorno) -- escrito contra la documentacion oficial.

export type ClimateSummary = { avgMaxC: number; avgMinC: number; avgPrecipMm: number; yearsUsed: number };

async function fetchYearRange(lat: number, lon: number, startDate: string, endDate: string) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Open-Meteo API error ${res.status}`);
  return res.json();
}

/**
 * Clima habitual para un destino en un rango de fechas (dia y mes), promediando los
 * ultimos 3 anos disponibles. Devuelve null si falta la coordenada del destino o si
 * fallan todas las peticiones (best-effort, nunca debe romper una busqueda).
 */
export async function getTypicalClimate(destinationIata: string, monthDay: { month: number; day: number }, spanDays: number): Promise<ClimateSummary | null> {
  const geo = getAirportGeo(destinationIata);
  if (!geo) return null;

  const now = new Date();
  const years = [now.getFullYear() - 1, now.getFullYear() - 2, now.getFullYear() - 3];

  const results = await Promise.allSettled(
    years.map((year) => {
      const start = new Date(Date.UTC(year, monthDay.month - 1, monthDay.day));
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + Math.max(0, spanDays - 1));
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      return fetchYearRange(geo.lat, geo.lon, fmt(start), fmt(end));
    })
  );

  const maxes: number[] = [];
  const mins: number[] = [];
  const precips: number[] = [];
  let yearsUsed = 0;

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const daily = r.value?.daily;
    if (!daily?.temperature_2m_max?.length) continue;
    yearsUsed += 1;
    for (const v of daily.temperature_2m_max) if (typeof v === 'number') maxes.push(v);
    for (const v of daily.temperature_2m_min) if (typeof v === 'number') mins.push(v);
    for (const v of daily.precipitation_sum ?? []) if (typeof v === 'number') precips.push(v);
  }

  if (yearsUsed === 0 || maxes.length === 0) return null;
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  return {
    avgMaxC: Math.round(avg(maxes)),
    avgMinC: Math.round(avg(mins)),
    avgPrecipMm: Math.round(avg(precips)),
    yearsUsed
  };
}
