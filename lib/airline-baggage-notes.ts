// Avisos fijos sobre politica de equipaje de las aerolineas mas habituales en rutas
// directas desde Espana, con medidas y peso del equipaje de MANO (el que va gratis,
// bajo el asiento) -- es lo que mas importa para no acabar facturando en la puerta de
// embarque. Contenido editorial (no una API): estas cifras SI cambian con el tiempo y
// varian por tarifa, asi que se marcan como aproximadas y se anima a comprobar antes
// de viajar. Fuentes consultadas en esta sesion (2026): paginas de comparativa de
// equipaje de mano de varias tiendas especializadas y Which?, cruzadas entre si.

export type BaggageInfo = { note: string; freeBagCm: string; freeBagKg: string | null };

const BAGGAGE_INFO: Record<string, BaggageInfo> = {
  ryanair: {
    note: 'Solo incluye el bolso pequeno bajo el asiento. La maleta de cabina grande (con Priority) y la facturada se pagan aparte.',
    freeBagCm: '40 x 20 x 25 cm',
    freeBagKg: 'sin limite de peso indicado'
  },
  'wizz air': {
    note: 'Solo incluye el bolso pequeno bajo el asiento. La maleta de cabina grande (con WIZZ Priority) y la facturada se pagan aparte.',
    freeBagCm: '40 x 30 x 20 cm',
    freeBagKg: 'hasta 10 kg'
  },
  easyjet: {
    note: 'Incluye un bolso pequeno bajo el asiento. La maleta de cabina grande (con ruedas, para el maletero superior) normalmente se paga aparte.',
    freeBagCm: '45 x 36 x 20 cm',
    freeBagKg: 'sin limite de peso indicado'
  },
  vueling: {
    note: 'Incluye un bolso pequeno bajo el asiento. La maleta de cabina grande (55x40x20cm, hasta 10kg) depende de la tarifa elegida.',
    freeBagCm: '40 x 30 x 20 cm',
    freeBagKg: 'sin limite de peso indicado'
  },
  volotea: {
    note: 'Solo incluye un bolso pequeno bajo el asiento en la tarifa basica.',
    freeBagCm: '40 x 30 x 20 cm',
    freeBagKg: null
  },
  norwegian: {
    note: 'Solo incluye un bolso pequeno bajo el asiento en la tarifa basica ("LowFare").',
    freeBagCm: '40 x 30 x 20 cm',
    freeBagKg: null
  }
};

export function getBaggageNote(airlineName: string): string | null {
  return getBaggageInfo(airlineName)?.note ?? null;
}

export function getBaggageInfo(airlineName: string): BaggageInfo | null {
  const key = airlineName.trim().toLowerCase();
  if (BAGGAGE_INFO[key]) return BAGGAGE_INFO[key];
  for (const [name, info] of Object.entries(BAGGAGE_INFO)) {
    if (key.includes(name)) return info;
  }
  return null;
}
