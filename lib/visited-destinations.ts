// Destinos que el usuario marca como "ya he estado aqui" -- se guardan en el propio
// telefono (localStorage), igual que el perfil de viaje y el historial de busquedas.
// Se usan para excluirlos de Sorprendeme (IA) y de Explorar destinos (Travelpayouts),
// asi no se repiten sitios ya visitados.

const STORAGE_KEY = 'tiriti_visited_destinations_v1';

export function getVisitedDestinations(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function toggleVisitedDestination(iata: string): string[] {
  const current = getVisitedDestinations();
  const next = current.includes(iata) ? current.filter((i) => i !== iata) : [...current, iata];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage lleno o bloqueado -- no critico, simplemente no se recuerda.
  }
  return next;
}
