-- Esquema aplicado en Neon (proyecto tiriti-travel). Documentado aquí para referencia y control de versiones.

CREATE TABLE IF NOT EXISTS destination_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  excluded BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS airports (
  iata CHAR(3) PRIMARY KEY,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  group_id TEXT REFERENCES destination_groups(id),
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
