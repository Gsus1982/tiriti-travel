// Perfil de viaje: recuerda las cosas que casi nunca cambian entre una busqueda y la
// siguiente (tus origenes habituales, cuantos viajais) para no tener que rellenarlas
// cada vez -- a diferencia del historial de busquedas (lib/search-history.ts), que
// guarda busquedas CONCRETAS ya hechas, esto es tu configuracion de fondo.

const STORAGE_KEY = 'tiriti_travel_profile_v1';

export type TravelProfile = {
  originIatas: string[];
  adults: number;
  children: number;
  requireCabinBaggage: boolean;
  allowOpenJaw: boolean;
};

export function getTravelProfile(): TravelProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.originIatas)) return null;
    return parsed as TravelProfile;
  } catch {
    return null;
  }
}

export function saveTravelProfile(profile: TravelProfile): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // localStorage lleno o bloqueado (modo privado) -- no es critico, simplemente no
    // se recuerda para la proxima vez.
  }
}
