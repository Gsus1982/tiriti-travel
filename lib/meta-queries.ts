import { sql } from './db';

export async function listOriginAirports() {
  return (await sql`SELECT iata, city FROM airports WHERE is_origin_candidate = TRUE ORDER BY city`) as {
    iata: string;
    city: string;
  }[];
}
