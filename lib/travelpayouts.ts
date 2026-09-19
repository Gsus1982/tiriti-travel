// "Explorar destinos" sin gastar cuota de Ignav: usa la API de datos de Travelpayouts
// (Aviasales Data API), que da precios aproximados basados en busquedas reales de otros
// viajeros, cacheados hasta 7 dias -- no son precios en firme ni reservables, son
// orientativos para INSPIRAR, antes de gastar la cuota de verdad en los finalistas que
// interesen. Gratis: solo hace falta registrarse como afiliado en travelpayouts.com
// para conseguir un "token" (no piden tarjeta).
//
// AVISO: no se ha podido verificar contra la API real en esta sesion (sin token de
// prueba disponible) -- escrito contra la documentacion oficial
// (https://travelpayouts.github.io/slate/, endpoint v1/city-directions y v1/prices/calendar).

export type CheapDestination = {
  destinationIata: string;
  price: number;
  currency: string;
  departureAt: string | null;
  returnAt: string | null;
  transfers: number;
};

export async function getCheapDestinationsFromOrigin(origin: string, currency = 'eur'): Promise<CheapDestination[]> {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) throw new Error('TRAVELPAYOUTS_TOKEN no configurada');

  const url = `https://api.travelpayouts.com/v1/city-directions?origin=${encodeURIComponent(
    origin
  )}&currency=${encodeURIComponent(currency)}&token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Travelpayouts API error ${res.status}: ${text}`);
  }
  const data = await res.json();
  if (!data?.success) throw new Error('Travelpayouts: respuesta sin exito');

  const entries = Object.values(data.data ?? {}) as Record<string, any>[];
  return entries
    .filter((d) => typeof d.price === 'number' && d.destination)
    .map((d) => ({
      destinationIata: d.destination,
      price: d.price,
      currency: (data.currency ?? currency).toUpperCase(),
      departureAt: d.departure_at ?? null,
      returnAt: d.return_at ?? null,
      transfers: d.transfers ?? 0
    }));
}

export type FreeCalendarDay = { date: string; price: number | null };

/**
 * Calendario de precios GRATIS (sin gastar cuota de Ignav) para una ruta concreta,
 * usando datos agregados de Travelpayouts para un mes completo -- pensado como filtro
 * previo: ver que dias del mes pintan mejor ANTES de gastar la cuota real de Ignav en
 * el calendario de verdad (que cuesta 1 peticion real por dia consultado). No son
 * precios en firme, son orientativos (misma limitacion que "Explorar destinos").
 */
export async function getFreePriceCalendar(origin: string, destination: string, yearMonth: string, currency = 'eur'): Promise<FreeCalendarDay[]> {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) throw new Error('TRAVELPAYOUTS_TOKEN no configurada');

  const url = `https://api.travelpayouts.com/v1/prices/calendar?origin=${encodeURIComponent(
    origin
  )}&destination=${encodeURIComponent(destination)}&depart_date=${encodeURIComponent(
    yearMonth
  )}&calendar_type=departure_date&currency=${encodeURIComponent(currency)}&token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Travelpayouts API error ${res.status}: ${text}`);
  }
  const data = await res.json();
  if (!data?.success) throw new Error('Travelpayouts: respuesta sin exito');

  const entries = Object.entries(data.data ?? {}) as [string, { price?: number }][];
  return entries.map(([date, v]) => ({ date, price: typeof v?.price === 'number' ? v.price : null }));
}
