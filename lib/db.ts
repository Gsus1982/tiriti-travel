import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // No lanzamos error en build time; solo al ejecutar una query real.
  console.warn('DATABASE_URL no está definida. Configúrala en .env.local o en Vercel.');
}

export const sql = neon(connectionString ?? '');
