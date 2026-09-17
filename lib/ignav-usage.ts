import { sql } from './db';

// Cuota total de Ignav: 1000 peticiones DE POR VIDA (no mensual, no se renueva). Este
// numero viene de la documentacion del propio Ignav (ver LEEME.md/README historico del
// proyecto) -- si tu plan cambia, actualiza esta constante.
export const IGNAV_LIFETIME_QUOTA = 1000;

/**
 * Registra una peticion real a Ignav (llamar desde el UNICO punto de salida,
 * lib/ignav.ts::ignavPost, justo tras recibir cualquier respuesta HTTP -- incluidos
 * errores 4xx/5xx, que Ignav factura igual porque su servidor SI proceso la peticion).
 * Best-effort a proposito: un fallo aqui nunca debe romper una busqueda real.
 */
export async function logIgnavRequest(): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await sql`
      INSERT INTO ignav_usage_log (date, request_count)
      VALUES (${today}, 1)
      ON CONFLICT (date) DO UPDATE SET request_count = ignav_usage_log.request_count + 1
    `;
  } catch {
    // Silencioso a proposito -- ver comentario de arriba.
  }
}

export type IgnavUsageSummary = {
  totalUsed: number;
  remaining: number;
  last7Days: number;
  last30Days: number;
  quota: number;
};

/** Resumen de cuota consumida, para mostrar en la interfaz. */
export async function getIgnavUsageSummary(): Promise<IgnavUsageSummary> {
  const totalRows = (await sql`SELECT COALESCE(SUM(request_count), 0)::int AS total FROM ignav_usage_log`) as {
    total: number;
  }[];
  const last7Rows = (await sql`
    SELECT COALESCE(SUM(request_count), 0)::int AS total FROM ignav_usage_log WHERE date >= CURRENT_DATE - INTERVAL '7 days'
  `) as { total: number }[];
  const last30Rows = (await sql`
    SELECT COALESCE(SUM(request_count), 0)::int AS total FROM ignav_usage_log WHERE date >= CURRENT_DATE - INTERVAL '30 days'
  `) as { total: number }[];

  const totalUsed = totalRows[0]?.total ?? 0;
  return {
    totalUsed,
    remaining: Math.max(0, IGNAV_LIFETIME_QUOTA - totalUsed),
    last7Days: last7Rows[0]?.total ?? 0,
    last30Days: last30Rows[0]?.total ?? 0,
    quota: IGNAV_LIFETIME_QUOTA
  };
}

/**
 * Limite de destinos (combinado con grupos, aunque ya no existen) dinamico segun la
 * cuota restante -- en vez del fijo de 6 de siempre. Mientras quede mucha cuota (mas de
 * la mitad), se permite algo mas de margen; cerca del final, se vuelve mas
 * conservador. Nunca baja de 3 ni sube de 10, para no descontrolar el UX del limite.
 */
export function dynamicComboLimit(remaining: number, quota: number): number {
  const ratio = remaining / quota;
  if (ratio > 0.5) return 10;
  if (ratio > 0.2) return 6;
  if (ratio > 0.05) return 4;
  return 3;
}
