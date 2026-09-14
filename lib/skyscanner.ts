// Cliente opcional para la API "Sky Scrapper" (RapidAPI, proveedor apiheya:
// https://rapidapi.com/apiheya/api/sky-scrapper). Pensado como buscador
// alternativo/complementario a Ignav: util para verificar precios cruzados o
// como fallback si Ignav se queda sin cuota gratuita.
//
// IMPORTANTE DE SEGURIDAD: la API key NUNCA debe hardcodearse en este archivo
// ni en ningun otro fichero versionado. Debes configurarla como variable de
// entorno en Vercel:
//   Project Settings -> Environment Variables -> RAPIDAPI_SKY_SCRAPPER_KEY
//
// Si la key se ha compartido alguna vez en texto plano (chat, captura, etc.),
// regenerala desde tu panel de RapidAPI antes de darla por buena en produccion.

const RAPIDAPI_HOST = 'sky-scrapper.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}/api/v1`;

function getApiKey(): string {
  const key = process.env.RAPIDAPI_SKY_SCRAPPER_KEY;
  if (!key) {
    throw new Error(
      'RAPIDAPI_SKY_SCRAPPER_KEY no esta configurada. Anadela como variable de entorno en Vercel antes de usar este cliente.'
    );
  }
  return key;
}

async function skyFetch(path: string, params: Record<string, string>) {
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      'x-rapidapi-key': getApiKey(),
      'x-rapidapi-host': RAPIDAPI_HOST
    },
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Sky Scrapper API respondio ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

export type SkyAirport = {
  skyId: string;
  entityId: string;
  presentation: { title: string; suggestionTitle?: string; subtitle?: string };
};

/** Busca el skyId/entityId de un aeropuerto o ciudad por texto libre (necesario antes de buscar vuelos). */
export async function searchAirport(query: string): Promise<SkyAirport[]> {
  const data = await skyFetch('/flights/searchAirport', { query, locale: 'es-ES' });
  const raw: any[] = data?.data ?? [];
  // FIX (auditoria): esta misma API (verificada en buscador_viajes.py, el script que ya
  // usas y funciona) a veces devuelve skyId/entityId anidados bajo
  // navigation.relevantFlightParams en vez de en la raiz del item. Sin este fallback,
  // estos campos llegaban undefined y searchFlights fallaba silenciosamente.
  return raw.map((item) => ({
    skyId: item.skyId ?? item.navigation?.relevantFlightParams?.skyId,
    entityId: item.entityId ?? item.navigation?.relevantFlightParams?.entityId,
    presentation: item.presentation ?? { title: query }
  }));
}

export type SkyFlightSearchParams = {
  originSkyId: string;
  destinationSkyId: string;
  originEntityId: string;
  destinationEntityId: string;
  date: string;
  returnDate?: string;
  adults?: number;
  children?: number;
  currency?: string;
  market?: string;
  countryCode?: string;
};

/** Busca vuelos entre dos aeropuertos/ciudades ya resueltos con searchAirport. */
export async function searchFlights(params: SkyFlightSearchParams) {
  const data = await skyFetch('/flights/searchFlights', {
    originSkyId: params.originSkyId,
    destinationSkyId: params.destinationSkyId,
    originEntityId: params.originEntityId,
    destinationEntityId: params.destinationEntityId,
    date: params.date,
    ...(params.returnDate ? { returnDate: params.returnDate } : {}),
    adults: String(params.adults ?? 1),
    children: String(params.children ?? 0),
    currency: params.currency ?? 'EUR',
    market: params.market ?? 'es-ES',
    countryCode: params.countryCode ?? 'ES'
  });
  return data?.data;
}
