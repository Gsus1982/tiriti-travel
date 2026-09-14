import { neon, NeonQueryFunction } from '@neondatabase/serverless';

let cachedSql: NeonQueryFunction<false, false> | null = null;

function sanitizeConnectionString(raw: string): string {
  // FIX (auditoria): antes se sustituian espacios invisibles/no-ASCII por un ESPACIO
  // normal y luego se hacia .trim() -- eso solo arregla el caso en que el caracter
  // esta en un borde. Si cae en medio de la cadena (copy/paste desde un editor con
  // formato), el resultado seguia siendo una URL rota, solo que de otra forma. Una
  // connection string nunca lleva espacios legitimos, asi que ahora se eliminan del
  // todo en vez de sustituirlos.
  return raw
    .replace(/[\s\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\u200B\u200C\u200D\uFEFF]/g, '')
    .trim();
}

function assertAscii(value: string): void {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 255) {
      throw new Error(
        `DATABASE_URL contiene un caracter no-ASCII en la posicion ${i} (codigo Unicode ${value.charCodeAt(i)}). Revisa que la variable de entorno no tenga espacios especiales o caracteres invisibles (copia/pega desde un editor con formato).`
      );
    }
  }
}

function getSql(): NeonQueryFunction<false, false> {
  if (cachedSql) return cachedSql;
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      'DATABASE_URL no esta definida. Configurala en .env.local (desarrollo) o en Vercel > Project Settings > Environment Variables (produccion).'
    );
  }
  const connectionString = sanitizeConnectionString(raw);
  assertAscii(connectionString);
  cachedSql = neon(connectionString);
  return cachedSql;
}

export const sql: NeonQueryFunction<false, false> = ((...args: unknown[]) => {
  const client = getSql();
  // @ts-expect-error - reenvio de la llamada como template tag
  return client(...args);
}) as NeonQueryFunction<false, false>;
