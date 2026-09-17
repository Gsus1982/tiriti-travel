import { getAirportGeo } from './airport-geo';

// Estimacion, no una medicion certificada -- mismo enfoque que usan calculadoras como
// myclimate/ICAO para vuelos de corto-medio radio en clase turista (varia entre 70-115
// g CO2/km/pasajero segun la fuente; 100 es un termino medio razonable, citado por
// varias calculadoras publicas). Se etiqueta siempre como "estimado" en la interfaz.
const CO2_G_PER_KM_PER_PAX = 100;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // radio medio de la Tierra en km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export type Co2Estimate = { distanceKm: number; kgPerPassenger: number };

/** Estimacion de CO2 ida+vuelta por pasajero, en kg. null si falta algun dato de coordenadas. */
export function estimateCo2(originIata: string, destinationIata: string): Co2Estimate | null {
  const o = getAirportGeo(originIata);
  const d = getAirportGeo(destinationIata);
  if (!o || !d) return null;
  const distanceKm = Math.round(haversineKm(o.lat, o.lon, d.lat, d.lon));
  const kgPerPassenger = Math.round((distanceKm * 2 * CO2_G_PER_KM_PER_PAX) / 1000);
  return { distanceKm, kgPerPassenger };
}
