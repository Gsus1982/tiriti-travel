import { sql } from './db';

// Movido fuera de lib/search-engine.ts (auditoria, motor mock huerfano) porque
// app/api/meta/route.ts dependia de estas dos funciones aunque el motor mock en si
// ya no se usa desde la UI. Mantenerlas aqui permite borrar el motor mock sin romper
// el selector de origenes/destinos curados de la app.

export async function listDestinationGroups() {
  return (await sql`SELECT id, name, country FROM destination_groups WHERE excluded = FALSE ORDER BY name`) as {
    id: string;
    name: string;
    country: string;
  }[];
}

export async function listOriginAirports() {
  return (await sql`SELECT iata, city FROM airports WHERE is_origin_candidate = TRUE ORDER BY city`) as {
    iata: string;
    city: string;
  }[];
}
