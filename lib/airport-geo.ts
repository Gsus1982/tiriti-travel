import geoData from './data/airports-geo.json';

// Dataset abierto (https://github.com/mwgg/Airports, verificado y filtrado a solo
// aeropuertos con codigo IATA en esta sesion) -- 7917 aeropuertos con coordenadas y
// pais ISO-2. Aena no da coordenadas ni codigo ISO de pais, asi que esto llena ese
// hueco sin depender de ninguna API externa para lo mas basico (lat/lon/pais).
export type AirportGeo = { lat: number; lon: number; country: string; city: string };

const DATA = geoData as Record<string, AirportGeo>;

export function getAirportGeo(iata: string): AirportGeo | null {
  return DATA[iata.toUpperCase()] ?? null;
}
