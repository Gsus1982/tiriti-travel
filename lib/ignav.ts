const IGNAV_BASE_URL = 'https://ignav.com/api/fares';

export type IgnavPrice = { amount: number; currency: string; status: 'verified' | 'unverified' };

export type IgnavSegment = {
  marketing_carrier_code: string | null;
  flight_number: string | null;
  operating_carrier_name: string | null;
  departure_airport: string;
  departure_time_local: string;
  departure_timezone: string | null;
  departure_time_utc: string | null;
  arrival_airport: string;
  arrival_time_local: string;
  arrival_timezone: string | null;
  arrival_time_utc: string | null;
  duration_minutes: number;
  aircraft: string | null;
};

export type IgnavLeg = {
  carrier?: string;
  duration_minutes?: number;
  segments: IgnavSegment[];
};

export type IgnavItinerary = {
  price: IgnavPrice;
  outbound: IgnavLeg;
  inbound?: IgnavLeg;
  cabin_class: string;
  bags?: { carry_on?: number; checked?: number };
  requires_self_transfer: boolean;
  ignav_id: string;
};

export type IgnavOneWayResponse = {
  origin: string;
  destination: string;
  departure_date: string;
  itineraries: IgnavItinerary[];
};

export type TimeRangeFilter = {
  earliest_hour?: number;
  latest_hour?: number;
  arrival_earliest_hour?: number;
  arrival_latest_hour?: number;
};

export type OneWaySearchParams = {
  origin: string;
  destination: string;
  departure_date: string;
  adults?: number;
  children?: number;
  cabin_class?: string;
  max_stops?: number;
  min_carry_on_bags?: number;
  min_checked_bags?: number;
  max_price?: number;
  departure_time_range?: TimeRangeFilter;
  airlines_include?: string[];
  airlines_exclude?: string[];
  allow_self_transfer?: boolean;
  market?: string;
};

function sanitize(raw: string): string {
  // FIX (auditoria): mismo problema que en lib/db.ts -- sustituir por un espacio en vez
  // de eliminar solo arregla el caso de borde; una API key nunca lleva espacios legitimos.
  return raw.replace(/[\s\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\u200B\u200C\u200D\uFEFF]/g, '').trim();
}

function getApiKey(): string {
  const key = process.env.IGNAV_API_KEY;
  if (!key) {
    throw new Error('IGNAV_API_KEY no esta definida. Anadela en Vercel > Project Settings > Environment Variables.');
  }
  return sanitize(key);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRYABLE_STATUSES = new Set([424, 429, 502, 503, 504]);
// FIX (bug reportado: busquedas con muchos timeouts de Ignav en paralelo): con 2
// reintentos y un timeout de 8s por intento, UNA sola ruta lenta podia tardar hasta
// ~25s en agotar sus reintentos (8s + 400ms + 8s + 800ms + 8s), muy por encima del
// limite de funcion de Vercel (10s en el plan Hobby). Con varias peticiones en paralelo
// (hasta 60 por busqueda), bastaba con que una fuera lenta para arriesgar que Vercel
// matara la funcion entera antes de que el resto de rutas, mas rapidas, pudieran
// devolver su resultado. Bajado a 1 reintento (peor caso ~16.4s por ruta) para reducir
// ese riesgo, aunque no lo elimina del todo -- ver docs/STATUS.md.
const MAX_RETRIES = 1;

async function ignavPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${IGNAV_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          'X-Api-Key': getApiKey(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        // FIX (auditoria): sin timeout, un Ignav colgado bloqueaba la peticion hasta que
        // Vercel mataba la funcion entera a los 10s (plan Hobby), sin dar ninguna
        // oportunidad de fallar rapido y seguir con el resto de peticiones en paralelo.
        signal: AbortSignal.timeout(8000)
      });
    } catch (err) {
      // FIX (auditoria): antes, si fetch() lanzaba (timeout, DNS, red caida), el error
      // se propagaba directo sin pasar por la logica de reintento de abajo -- una sola
      // incidencia de red abortaba toda la busqueda. Ahora se trata igual que un status
      // reintentable.
      lastError = err instanceof Error ? err : new Error('Error de red desconocido llamando a Ignav');
      if (attempt === MAX_RETRIES) throw lastError;
      await sleep(400 * (attempt + 1));
      continue;
    }
    if (res.ok) {
      return (await res.json()) as T;
    }
    const text = await res.text().catch(() => '');
    lastError = new Error(`Ignav API error ${res.status} en ${path}: ${text}`);
    if (!RETRYABLE_STATUSES.has(res.status) || attempt === MAX_RETRIES) {
      throw lastError;
    }
    await sleep(400 * (attempt + 1));
  }
  throw lastError ?? new Error('Error desconocido llamando a Ignav');
}

export async function searchOneWay(params: OneWaySearchParams): Promise<IgnavOneWayResponse> {
  const cleanParams = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
  return ignavPost<IgnavOneWayResponse>('/one-way', { market: 'ES', ...cleanParams });
}

export type BookingLinksResponse = {
  itinerary: IgnavItinerary;
  booking_options: {
    legs: string[];
    links: {
      provider_name: string;
      provider_type: string;
      fare_name?: string;
      price?: IgnavPrice;
      url: string;
    }[];
  }[];
};

export async function getBookingLinksByIgnavId(ignavId: string): Promise<BookingLinksResponse> {
  return ignavPost<BookingLinksResponse>('/booking-links', { ignav_id: ignavId });
}
