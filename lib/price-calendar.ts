import { searchOneWay } from './ignav';

export type PriceCalendarDay = {
  date: string;
  minPrice: number | null;
  currency: string | null;
  flightCount: number;
};

export const MAX_CALENDAR_DAYS = 14;

function isoDatesBetween(from: string, to: string): string[] {
  const start = new Date(from);
  const end = new Date(to);
  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
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
  if (dates.length > MAX_CALENDAR_DAYS) {
    throw new Error(`El calendario de precios admite como maximo ${MAX_CALENDAR_DAYS} dias por consulta.`);
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
