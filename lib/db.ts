import { neon, NeonQueryFunction } from '@neondatabase/serverless';

let cachedSql: NeonQueryFunction<false, false> | null = null;

/**
 * Inicialización perezosa: no se ejecuta al importar el módulo (evita que
 * el build de Next.js falle si DATABASE_URL aún no está configurada), solo
 * cuando se realiza una consulta real en tiempo de ejecución.
 */
function getSql(): NeonQueryFunction<false, false> {
  if (cachedSql) return cachedSql;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL no está definida. Configúrala en .env.local (desarrollo) o en Vercel > Project Settings > Environment Variables (producción).'
    );
  }
  cachedSql = neon(connectionString);
  return cachedSql;
}

export const sql: NeonQueryFunction<false, false> = ((...args: unknown[]) => {
  const client = getSql();
  // @ts-expect-error - reenvío de la llamada como template tag
  return client(...args);
}) as NeonQueryFunction<false, false>;
