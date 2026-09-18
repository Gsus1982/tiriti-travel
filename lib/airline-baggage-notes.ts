// Avisos fijos sobre politica de equipaje de las aerolineas mas habituales en rutas
// directas desde Espana, conocidas por cobrar aparte hasta la maleta de cabina grande.
// Contenido editorial (no una API, no cambia con frecuencia) -- si una aerolinea
// cambia su politica, actualizar aqui a mano.

const BAGGAGE_NOTES: Record<string, string> = {
  ryanair: 'Solo incluye un bolso pequeno bajo el asiento. La maleta de cabina grande y la facturada se pagan aparte.',
  'wizz air': 'Solo incluye un bolso pequeno bajo el asiento. La maleta de cabina grande y la facturada se pagan aparte.',
  easyjet: 'Incluye un bolso pequeno bajo el asiento. La maleta de cabina grande (con ruedas) normalmente se paga aparte.',
  vueling: 'Incluye un bolso pequeno bajo el asiento. La maleta de cabina grande depende de la tarifa elegida.',
  volotea: 'Solo incluye un bolso pequeno bajo el asiento en la tarifa basica.',
  norwegian: 'Solo incluye un bolso pequeno bajo el asiento en la tarifa basica ("LowFare").'
};

/** Aviso de equipaje para una aerolinea, o null si no hay nota conocida (aerolineas de red tradicionales suelen incluir cabina sin coste aparte). */
export function getBaggageNote(airlineName: string): string | null {
  const key = airlineName.trim().toLowerCase();
  if (BAGGAGE_NOTES[key]) return BAGGAGE_NOTES[key];
  for (const [name, note] of Object.entries(BAGGAGE_NOTES)) {
    if (key.includes(name)) return note;
  }
  return null;
}
