// Frankfurter.app -- gratis, sin clave, sin registro, datos oficiales del Banco Central
// Europeo. Solo tiene sentido para destinos fuera de la zona euro.
//
// AVISO: no se ha podido verificar contra la API real en esta sesion (sin acceso de red
// a frankfurter.app desde este entorno) -- escrito contra la documentacion oficial
// (https://frankfurter.dev).

// Mapa PAIS ISO-2 -> moneda ISO-3, solo para los paises que aparecen habitualmente
// como destino en esta app (Europa + algunos vecinos) y que NO usan el euro. Si un pais
// no esta aqui, se asume que usa euro y no se muestra conversion (la app opera siempre
// en EUR).
const NON_EUR_CURRENCY_BY_COUNTRY: Record<string, string> = {
  GB: 'GBP',
  CH: 'CHF',
  NO: 'NOK',
  SE: 'SEK',
  DK: 'DKK',
  PL: 'PLN',
  CZ: 'CZK',
  HU: 'HUF',
  RO: 'RON',
  BG: 'BGN',
  RS: 'RSD',
  TR: 'TRY',
  MA: 'MAD',
  TN: 'TND',
  EG: 'EGP',
  IS: 'ISK',
  AL: 'ALL',
  BA: 'BAM',
  MK: 'MKD',
  ME: 'EUR', // Montenegro usa euro sin ser miembro de la UE
  XK: 'EUR' // Kosovo, igual
};

export function currencyForCountry(countryIso2: string): string | null {
  return NON_EUR_CURRENCY_BY_COUNTRY[countryIso2.toUpperCase()] ?? null;
}

export type ExchangeRate = { currency: string; rate: number };

/** 1 EUR = X <currency>. null si el pais usa euro o si falla la peticion. */
export async function getExchangeRateFromEur(countryIso2: string): Promise<ExchangeRate | null> {
  const currency = currencyForCountry(countryIso2);
  if (!currency) return null;
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=EUR&to=${currency}`, {
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data?.rates?.[currency];
    if (typeof rate !== 'number') return null;
    return { currency, rate };
  } catch {
    return null;
  }
}
