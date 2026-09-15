// Insignias de aerolinea: iniciales en un circulo de color, NO logos reales (serian
// marca registrada de cada aerolinea, y usarlos via una API de logos añadiria otra
// clave mas que gestionar solo para esto). Colores aproximados a la identidad de cada
// aerolinea para que se reconozcan de un vistazo, cubriendo las mas habituales en
// vuelos directos desde Alicante/Madrid/Valencia/Murcia.

type Badge = { initials: string; bg: string; fg: string };

const KNOWN: Record<string, Badge> = {
  ryanair: { initials: 'FR', bg: '#073590', fg: '#ffffff' },
  vueling: { initials: 'VY', bg: '#ffcb05', fg: '#0a0c10' },
  easyjet: { initials: 'U2', bg: '#ff6600', fg: '#ffffff' },
  iberia: { initials: 'IB', bg: '#d7192d', fg: '#ffffff' },
  'wizz air': { initials: 'W6', bg: '#c6007e', fg: '#ffffff' },
  'air europa': { initials: 'UX', bg: '#003876', fg: '#ffffff' },
  volotea: { initials: 'V7', bg: '#e6007e', fg: '#ffffff' },
  norwegian: { initials: 'DY', bg: '#cc0033', fg: '#ffffff' },
  'tap portugal': { initials: 'TP', bg: '#00543c', fg: '#ffffff' },
  'british airways': { initials: 'BA', bg: '#075aaa', fg: '#ffffff' },
  lufthansa: { initials: 'LH', bg: '#05164d', fg: '#f9ba00' },
  'air france': { initials: 'AF', bg: '#002157', fg: '#ffffff' },
  klm: { initials: 'KL', bg: '#00a1de', fg: '#ffffff' },
  transavia: { initials: 'HV', bg: '#00a04b', fg: '#ffffff' },
  eurowings: { initials: 'EW', bg: '#590050', fg: '#ffffff' },
  'aer lingus': { initials: 'EI', bg: '#00693e', fg: '#ffffff' },
  luxair: { initials: 'LG', bg: '#e0001b', fg: '#ffffff' },
  swiss: { initials: 'LX', bg: '#cc0000', fg: '#ffffff' }
};

const FALLBACK_COLORS = ['#6366f1', '#0ea5e9', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Insignia para una aerolinea a partir de su nombre (o "Desconocida" si no se sabe). */
export function getAirlineBadge(airlineName: string): Badge {
  const key = airlineName.trim().toLowerCase();
  if (KNOWN[key]) return KNOWN[key];
  for (const [name, badge] of Object.entries(KNOWN)) {
    if (key.includes(name)) return badge;
  }
  // Aerolinea no reconocida: iniciales genericas de las 2 primeras palabras, color
  // estable segun el nombre (misma aerolinea siempre sale del mismo color).
  const words = airlineName.trim().split(/\s+/).filter(Boolean);
  const initials = (words[0]?.[0] ?? '?') + (words[1]?.[0] ?? words[0]?.[1] ?? '');
  const bg = FALLBACK_COLORS[hashString(key) % FALLBACK_COLORS.length];
  return { initials: initials.toUpperCase(), bg, fg: '#ffffff' };
}
