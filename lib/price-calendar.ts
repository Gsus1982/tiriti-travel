import { searchOneWay } from './ignav';
import { getIgnavUsageSummary, dynamicCalendarDaysLimit } from './ignav-usage';

export type PriceCalendarDay = {
  date: string;
  minPrice: number | null;
  currency: string | null;
  flightCount: number;
};

// Techo absoluto (peticion del usuario: subir de 14 a 30 dias). El limite REAL
// aplicado en cada consulta es dinamico segun la cuota restante -- ver
// dynamicCalendarDaysLimit en lib/ignav-usage.ts.
export const MAX_CALENDAR_DAYS = 30;

// FIX (mismo principio que el bug real de fechas del calendario del formulario
// principal): usar metodos de fecha LOCALES (getDate/setDate) mezclados con
// toISOString() (que trabaja en UTC) puede desplazar el dia si el entorno de ejecucion
// no esta en UTC. Vercel corre en UTC por defecto, pero para no depender de esa
// asuncion implicita, aqui se usan metodos UTC explicitos de principio a fin.
function isoDatesBetween(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export async function buildPriceCalendar(params: {
  origin: string;
  destination: string;
  dateFrom: string;
  dateTo: string;
  adults: number;
  children: number;
}): Promise<{ days: PriceCalendarDay[]; warnings: string[] }> {
  const dates = isoDatesBetween(params.dateFrom, params.dateTo);

  let dayLimit = MAX_CALENDAR_DAYS;
  try {
    const usage = await getIgnavUsageSummary();
    dayLimit = dynamicCalendarDaysLimit(usage.remaining, usage.quota);
  } catch {
    // Contador de cuota no disponible todavia -- se cae al techo fijo de 30.
  }

  if (dates.length > dayLimit) {
    throw new Error(`El calendario de precios admite como maximo ${dayLimit} dias por consulta ahora mismo (segun tu cuota restante de Ignav).`);
  }

  const warnings: string[] = [];
  const results = await Promise.all(
    dates.map(async (date) => {
      try {
        const resp = await searchOneWay({
          origin: params.origin,
          destination: params.destination,
          departure_date: date,
          adults: params.adults,
          children: params.children,
          max_stops: 0
        });
        const prices = resp.itineraries.map((it) => it.price.amount);
        const minPrice = prices.length ? Math.min(...prices) : null;
        const currency = resp.itineraries[0]?.price.currency ?? null;
        return { date, minPrice, currency, flightCount: resp.itineraries.length } as PriceCalendarDay;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        warnings.push(`${date}: ${message}`);
        return { date, minPrice: null, currency: null, flightCount: 0 } as PriceCalendarDay;
      }
    })
  );

  return { days: results, warnings };
}
