-- Esquema aplicado en Neon (proyecto tiriti-travel). Documentado aquí para referencia y control de versiones.

CREATE TABLE IF NOT EXISTS airports (
  iata CHAR(3) PRIMARY KEY,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  is_origin_candidate BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS legs (
  id SERIAL PRIMARY KEY,
  origin_iata CHAR(3) NOT NULL REFERENCES airports(iata),
  destination_iata CHAR(3) NOT NULL REFERENCES airports(iata),
  airline TEXT NOT NULL,
  flight_number TEXT NOT NULL,
  departure_at TIMESTAMPTZ NOT NULL,
  arrival_at TIMESTAMPTZ NOT NULL,
  duration_min INT NOT NULL,
  is_direct BOOLEAN NOT NULL DEFAULT TRUE,
  price_eur NUMERIC(8,2) NOT NULL,
  cabin_baggage_included BOOLEAN NOT NULL DEFAULT FALSE,
  checked_baggage_included BOOLEAN NOT NULL DEFAULT FALSE,
  cabin_class TEXT NOT NULL DEFAULT 'economy',
  seats_available INT,
  source TEXT NOT NULL DEFAULT 'mock',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transfer_times (
  origin_iata CHAR(3) NOT NULL REFERENCES airports(iata),
  destination_iata CHAR(3) NOT NULL REFERENCES airports(iata),
  mode TEXT NOT NULL,
  duration_min INT NOT NULL,
  price_eur NUMERIC(6,2),
  PRIMARY KEY(origin_iata, destination_iata, mode)
);

CREATE TABLE IF NOT EXISTS hotel_transfer (
  city TEXT PRIMARY KEY,
  airport_iata CHAR(3) REFERENCES airports(iata),
  airport_to_center_min INT NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_legs_origin_dest_date ON legs (origin_iata, destination_iata, departure_at);

-- Cache persistente de resoluciones IATA -> skyId/entityId de Sky Scrapper (RapidAPI).
-- Antes esta resolucion se repetia en cada busqueda (solo cacheada en memoria durante
-- una misma invocacion de la funcion serverless); dado que la cuota de Sky Scrapper es
-- ~100 peticiones AL MES (mucho mas ajustada que Ignav), cachear esto en BD ahorra una
-- peticion completa cada vez que se repite un aeropuerto ya resuelto antes (ALC, MAD,
-- VLC, RMU como origen, y cualquier destino ya buscado antes).
CREATE TABLE IF NOT EXISTS skyscanner_airport_cache (
  iata CHAR(3) PRIMARY KEY,
  sky_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- MIGRACION: eliminar destinos curados (sesion del 15 sep 2026)
-- ============================================================================
-- El esquema de arriba ya refleja el estado deseado (sin destination_groups ni
-- group_id), pero esta sesion no tiene credenciales de conexion a tu base de
-- datos real de Neon -- ejecuta esto TU MISMO en el SQL Editor de Neon para
-- que la base de datos coincida con lo que ahora espera el codigo:
--
--   ALTER TABLE airports DROP COLUMN IF EXISTS group_id;
--   DROP TABLE IF EXISTS destination_groups;
--   ALTER TABLE price_alerts DROP COLUMN IF EXISTS destination_group_id;
--
-- Orden importante: la columna group_id de airports (que referencia
-- destination_groups) hay que quitarla ANTES de borrar la tabla, o Postgres
-- se quejara de la referencia. destination_group_id en price_alerts es una
-- columna aparte sin relacion de bloqueo, se puede quitar en cualquier
-- momento. Ninguna de las 3 sentencias falla si la columna/tabla ya no
-- existe (los IF EXISTS son a proposito, para poder ejecutar esto sin miedo
-- aunque ya se haya aplicado antes).
--
-- El codigo de la aplicacion YA NO escribe ni lee ninguna de estas 3 cosas
-- desde este commit, asi que aunque no ejecutes esta migracion ahora mismo
-- la app funciona igual -- son columnas/tabla huerfanas que simplemente
-- dejan de usarse, no bloquean nada. Ejecutarla es solo para tener la base
-- de datos limpia y coherente con el codigo.
