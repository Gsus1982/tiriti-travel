// Guarda los ultimos resultados de una busqueda en localStorage, para poder mostrarlos
// si se corta la conexion a mitad de un viaje (no es una PWA completa con service
// worker -- version basica: solo el ULTIMO resultado visto, no las paginas/assets de
// la app en si, que ya sirve el navegador desde su propia cache HTTP habitual).

const STORAGE_KEY = 'tiriti_offline_cache_v1';

export type OfflineCache = { savedAt: string; itineraries: unknown[]; label: string };

export function saveOfflineCache(itineraries: unknown[], label: string): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: OfflineCache = { savedAt: new Date().toISOString(), itineraries, label };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage lleno o bloqueado -- no critico, solo no habra cache para offline.
  }
}

export function getOfflineCache(): OfflineCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OfflineCache) : null;
  } catch {
    return null;
  }
}
