const STORAGE_KEY = 'tiriti_search_history_v1';
const MAX_ENTRIES = 8;

export type SearchHistoryEntry = {
  label: string;
  url: string;
  savedAt: string; // ISO
};

export function getSearchHistory(): SearchHistoryEntry[] {
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

/** Anade una entrada al principio, evita duplicados exactos, y recorta a MAX_ENTRIES. */
export function addSearchHistoryEntry(label: string, url: string): SearchHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  const current = getSearchHistory().filter((e) => e.url !== url);
  const next = [{ label, url, savedAt: new Date().toISOString() }, ...current].slice(0, MAX_ENTRIES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage lleno o bloqueado (modo privado) -- no es critico, se pierde el
    // historial pero la busqueda ya se ha hecho igualmente.
  }
  return next;
}

export function clearSearchHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignorar
  }
}
