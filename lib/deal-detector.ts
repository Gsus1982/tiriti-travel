import { sql } from './db';
import { sendPushToAll } from './push';

// Detector de "chollo" al estilo Dollar Flight Club, pero adaptado a la realidad de
// esta app: DFC tiene un equipo buscando activamente tarifas de error en cientos de
// rutas; aqui no se puede permitir buscar activamente porque cada busqueda gasta cuota
// real de Ignav (1000 peticiones DE POR VIDA). En vez de eso, este detector es PASIVO:
// se apoya en los precios que la propia app ya ha visto (por busquedas normales del
// usuario o por las alertas guardadas) y que se registran en `price_history` --
// funciona sobre datos ya pagados, sin gastar ni una peticion extra.
//
// Limitacion honesta: solo puede detectar chollos en rutas que el usuario ya ha
// buscado antes (hace falta historial para tener un promedio contra el que comparar).
// No es un rastreador universal de tarifas de error como DFC, es un "aviso inteligente"
// sobre las rutas que de verdad interesan al usuario.

const RECENT_WINDOW = "interval '24 hours'";
const MIN_HISTORY_SAMPLES = 5;
const MIN_DISCOUNT_PCT = 35; // por debajo de esto no se considera "excepcional"
const DEDUPE_WINDOW_DAYS = 3; // no re-avisar de la misma ruta si ya se aviso hace poco

export async function detectAndNotifyDeals(): Promise<{ detected: number }> {
  try {
    const recentRows = (await sql`
      SELECT origin_iata, destination_iata, MIN(price)::numeric AS min_price, currency
      FROM price_history
      WHERE observed_at >= now() - interval '24 hours'
      GROUP BY origin_iata, destination_iata, currency
    `) as { origin_iata: string; destination_iata: string; min_price: string; currency: string }[];

    let detected = 0;

    for (const row of recentRows) {
      const price = Number(row.min_price);

      // Promedio historico EXCLUYENDO la ventana reciente, para que el propio chollo
      // no infle su propia media de referencia.
      const histRows = (await sql`
        SELECT AVG(price)::numeric AS avg, COUNT(*)::int AS n
        FROM price_history
        WHERE origin_iata = ${row.origin_iata} AND destination_iata = ${row.destination_iata}
          AND observed_at < now() - interval '24 hours'
      `) as { avg: string | null; n: number }[];

      const n = histRows[0]?.n ?? 0;
      if (n < MIN_HISTORY_SAMPLES || !histRows[0]?.avg) continue;
      const avg = Number(histRows[0].avg);

      const discountPct = Math.round((1 - price / avg) * 100);
      if (discountPct < MIN_DISCOUNT_PCT) continue;

      // Evitar avisar 2 veces del mismo chollo (o uno peor) en poco tiempo.
      const already = await sql`
        SELECT id FROM detected_deals
        WHERE origin_iata = ${row.origin_iata} AND destination_iata = ${row.destination_iata}
          AND notified_at >= now() - interval '3 days'
          AND price <= ${price}
        LIMIT 1
      `;
      if (already.length > 0) continue;

      const destRows = (await sql`
        SELECT dest_name FROM aena_destinations WHERE dest_iata = ${row.destination_iata} LIMIT 1
      `) as { dest_name: string }[];
      const destName = destRows[0]?.dest_name ?? row.destination_iata;

      await sql`
        INSERT INTO detected_deals (origin_iata, destination_iata, price, avg_price, discount_pct, currency)
        VALUES (${row.origin_iata}, ${row.destination_iata}, ${price}, ${avg}, ${discountPct}, ${row.currency})
      `;

      await sendPushToAll(
        '🔥 Chollo detectado en Tiriti Travel',
        `${row.origin_iata} -> ${destName}: ${price.toFixed(2)} ${row.currency} (${discountPct}% menos de lo habitual para esta ruta)`
      );
      detected++;
    }

    return { detected };
  } catch {
    // Tabla sin migrar todavia u otro fallo -- no debe romper el cron de alertas.
    return { detected: 0 };
  }
}
