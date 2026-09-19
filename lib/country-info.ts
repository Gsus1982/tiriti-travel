// REST Countries (https://restcountries.com) -- gratis, sin clave, sin registro.
// Usa el codigo ISO-2 del pais que ya resolvemos en lib/airport-geo.ts (del dataset
// abierto de aeropuertos), asi que no hace falta ningun mapeo nuevo nombre->codigo.
//
// AVISO: no se ha podido verificar contra la API real en esta sesion.

export type CountryInfo = { languages: string[]; drivingSide: 'left' | 'right' | null; capital: string | null };

// Paises con enchufe distinto al tipo C/F habitual en la Europa continental --
// contenido editorial fijo (REST Countries no da el tipo de enchufe), solo para los
// casos donde de verdad cambia algo practico para el viajero.
const DIFFERENT_PLUG: Record<string, string> = {
  GB: 'tipo G (como Irlanda, Malta y Chipre)',
  IE: 'tipo G',
  MT: 'tipo G',
  CY: 'tipo G',
  CH: 'tipo J',
  IT: 'tipo L (a veces sirve el europeo tipo C)',
  DK: 'tipo K (a veces sirve el europeo tipo C)'
};

export function getPlugNote(countryIso2: string): string | null {
  return DIFFERENT_PLUG[countryIso2.toUpperCase()] ?? null;
}

export async function getCountryInfo(countryIso2: string): Promise<CountryInfo | null> {
  try {
    const res = await fetch(`https://restcountries.com/v3.1/alpha/${countryIso2}?fields=languages,car,capital`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const languages = Object.values(data?.languages ?? {}) as string[];
    const side = data?.car?.side === 'left' ? 'left' : data?.car?.side === 'right' ? 'right' : null;
    const capital = Array.isArray(data?.capital) ? data.capital[0] ?? null : null;
    return { languages, drivingSide: side, capital };
  } catch {
    return null;
  }
}
