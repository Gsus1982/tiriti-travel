import { sql } from './db';

export type PriceTrend = { label: 'bajo' | 'normal' | 'alto'; avgPrice: number; sampleSize: number };

/**
 * Registra un precio real visto en una busqueda en vivo. Best-effort: nunca debe
 * romper una busqueda real si falla (tabla sin crear todavia, error de red puntual...).
 */
export async function logPriceObservation(
  originIata: string,
  destinationIata: string,
  departureDate: string,
  price: number,
  currency: string
): Promise<void> {
  try {
    await sql`
      INSERT INTO price_history (origin_iata, destination_iata, departure_date, price, currency)
      VALUES (${originIata}, ${destinationIata}, ${departureDate}, ${price}, ${currency})
    `;
  } catch {
    // Silencioso a proposito.
  }
}

/**
 * Tendencia de precio para una ruta concreta, comparando el precio dado contra el
 * promedio de precios observados historicamente para esa misma ruta (cualquier fecha,
 * no solo la misma -- con el volumen de un uso personal, exigir la misma fecha dejaria
 * casi siempre sin datos suficientes). Requiere un minimo de 3 observaciones previas
 * para no sacar conclusiones de una muestra demasiado pequena; si no hay suficientes,
 * devuelve null (la interfaz simplemente no muestra nada, no un "sin datos" ruidoso).
 */
export async function getPriceTrend(originIata: string, destinationIata: string, price: number): Promise<PriceTrend | null> {
  try {
    const rows = (await sql`
      SELECT AVG(price)::numeric AS avg, COUNT(*)::int AS n
      FROM price_history
      WHERE origin_iata = ${originIata} AND destination_iata = ${destinationIata}
    `) as { avg: string | null; n: number }[];
    const n = rows[0]?.n ?? 0;
    if (n < 3 || !rows[0]?.avg) return null;
    const avg = Number(rows[0].avg);
    const ratio = price / avg;
    const label: PriceTrend['label'] = ratio <= 0.9 ? 'bajo' : ratio >= 1.15 ? 'alto' : 'normal';
    return { label, avgPrice: avg, sampleSize: n };
  } catch {
    return null;
  }
}
