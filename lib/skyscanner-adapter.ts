import { sql } from './db';
import type { LiveItinerary, LiveLeg } from './live-engine';
import { searchAirport, searchFlights, type SkyAirport } from './skyscanner';

// Adaptador de Sky Scrapper (RapidAPI) como fuente ADICIONAL a Ignav, a peticion
// explicita del usuario: "mezclar resultados de ambas y marcar de donde viene cada uno".
//
// AVISO IMPORTANTE (sin verificar contra la API real): esta sesion no tiene una
// RAPIDAPI_SKY_SCRAPPER_KEY configurada ni acceso de red a sky-scrapper.p.rapidapi.com
// desde este entorno, asi que el parseo de abajo NO se ha podido probar contra una
// respuesta real de busqueda ida+vuelta. Esta escrito con la mejor informacion disponible:
// - La forma de una busqueda de SOLO IDA de esta misma API esta verificada en tu propio
//   script buscador_viajes.py (que ya usas y funciona): cada itinerario trae
//   `legs[0]` con `stopCount`, `durationInMinutes`, `carriers.marketing[0].name`,
//   `departure`/`arrival`, y el precio en `price.raw`.
// - Para una busqueda de IDA+VUELTA (con returnDate), la convencion habitual de esta
//   familia de APIs tipo Skyscanner es que cada itinerario trae `legs[0]` (ida) y
//   `legs[1]` (vuelta) en el mismo array.
// Prueba esto con una busqueda real en cuanto tengas la key puesta en Vercel; si algun
// campo no coincide (ver TODO mas abajo), el error aparecera en los avisos de la
// busqueda (no rompe Ignav, que sigue funcionando aparte) y hay que ajustar el mapeo.

// Cache en memoria de resoluciones IATA -> skyId/entityId, solo dentro de una misma
// invocacion de la funcion serverless -- evita resolver el mismo aeropuerto 2 veces
// dentro de la MISMA busqueda. Por encima, resolveAirport ahora consulta primero la
// tabla skyscanner_airport_cache (persistente en BD, ver scripts/schema.sql): dado que
// ALC/MAD/VLC/RMU como origen y los destinos habituales se repiten entre busquedas
// distintas, esto ahorra una peticion completa a la API cada vez que un aeropuerto ya
// se resolvio alguna vez antes -- relevante con una cuota de solo ~100/mes.
const airportCache = new Map<string, SkyAirport | null>();

async function resolveAirport(iata: string): Promise<SkyAirport | null> {
  if (airportCache.has(iata)) return airportCache.get(iata)!;

  try {
    const cached = (await sql`
      SELECT sky_id, entity_id FROM skyscanner_airport_cache WHERE iata = ${iata} LIMIT 1
    `) as { sky_id: string; entity_id: string }[];
    if (cached[0]) {
      const match: SkyAirport = { skyId: cached[0].sky_id, entityId: cached[0].entity_id, presentation: { title: iata } };
      airportCache.set(iata, match);
      return match;
    }
  } catch {
    // Si la tabla aun no existe (schema.sql no aplicado) o falla la consulta, se sigue
    // sin cache persistente en vez de romper la busqueda -- solo se pierde el ahorro de
    // cuota, no la funcionalidad.
  }

  try {
    const results = await searchAirport(iata);
    const match = results.find((r) => r.skyId && r.entityId) ?? null;
    airportCache.set(iata, match);
    if (match) {
      sql`
        INSERT INTO skyscanner_airport_cache (iata, sky_id, entity_id)
        VALUES (${iata}, ${match.skyId}, ${match.entityId})
        ON CONFLICT (iata) DO UPDATE SET sky_id = EXCLUDED.sky_id, entity_id = EXCLUDED.entity_id, resolved_at = now()
      `.catch(() => {
        // Guardar en cache es una optimizacion, no algo critico -- un fallo aqui no debe
        // tumbar la busqueda que ya tiene su resultado.
      });
    }
    return match;
  } catch {
    airportCache.set(iata, null);
    return null;
  }
}

function skyLegToLiveLeg(leg: any): LiveLeg | null {
  // TODO: verificar estos nombres de campo contra una respuesta real. Basado en la
  // familia de APIs tipo Skyscanner (misma convencion que legs[0] en buscador_viajes.py).
  if (!leg) return null;
  if ((leg.stopCount ?? 0) !== 0) return null; // solo directos, igual que con Ignav
  const originIata = leg.origin?.displayCode ?? leg.origin?.id;
  const destIata = leg.destination?.displayCode ?? leg.destination?.id;
  const departure = leg.departure;
  const arrival = leg.arrival;
  if (!originIata || !destIata || !departure || !arrival) return null;

  const carrierName = (leg.carriers?.marketing ?? [])[0]?.name ?? 'Desconocida';

  return {
    origin_iata: originIata,
    destination_iata: destIata,
    airline: carrierName,
    flight_number: leg.flightNumber ?? '',
    departure_at: new Date(departure).toISOString(),
    arrival_at: new Date(arrival).toISOString(),
    duration_min: leg.durationInMinutes ?? 0,
    price_amount: 0, // el precio de Sky Scrapper es del itinerario completo, no por tramo (se reparte al construir el LiveItinerary de abajo)
    price_currency: 'EUR',
    price_status: 'unverified',
    cabin_baggage_included: null,
    checked_baggage_included: null,
    requires_self_transfer: false,
    ignav_id: `skyscanner:${leg.id ?? `${originIata}-${destIata}-${departure}`}`
  };
}

/**
 * Busca un itinerario de ida y vuelta directo entre dos aeropuertos concretos en Sky
 * Scrapper (una sola llamada, a diferencia de Ignav que necesita 2 busquedas de ida
 * separadas). Nunca lanza -- si algo falla, devuelve [] y anota el motivo en warnings,
 * para no bloquear el resto de la busqueda (que sigue con Ignav).
 */
export async function searchSkyRoundTrip(
  originIata: string,
  destinationIata: string,
  outboundDate: string,
  inboundDate: string,
  pax: { adults: number; children: number },
  originName: string,
  destinationName: string,
  warnings: string[]
): Promise<LiveItinerary[]> {
  try {
    const [origin, destination] = await Promise.all([resolveAirport(originIata), resolveAirport(destinationIata)]);
    if (!origin || !destination) {
      warnings.push(`[Sky Scrapper] No se pudo resolver ${!origin ? originIata : destinationIata} a un aeropuerto valido.`);
      return [];
    }

    const data = await searchFlights({
      originSkyId: origin.skyId,
      destinationSkyId: destination.skyId,
      originEntityId: origin.entityId,
      destinationEntityId: destination.entityId,
      date: outboundDate,
      returnDate: inboundDate,
      adults: pax.adults,
      children: pax.children,
      currency: 'EUR'
    });

    const itineraries: any[] = data?.itineraries ?? [];
    const results: LiveItinerary[] = [];

    for (const it of itineraries) {
      const legs = it?.legs ?? [];
      const outbound = skyLegToLiveLeg(legs[0]);
      const inbound = skyLegToLiveLeg(legs[1]);
      if (!outbound || !inbound) continue; // solo nos interesan idas Y vueltas directas

      const totalPrice = typeof it.price?.raw === 'number' ? it.price.raw : null;
      if (totalPrice === null) continue;

      // El precio de Sky Scrapper viene del itinerario completo (ida+vuelta), no por
      // tramo como en Ignav -- se reparte a partes iguales solo para mostrarlo en el
      // desglose; totalPrice (el que de verdad se usa para filtrar/ordenar) es el real.
      outbound.price_amount = totalPrice / 2;
      inbound.price_amount = totalPrice / 2;

      const hotelCheckoutAt = new Date(inbound.departure_at);
      hotelCheckoutAt.setMinutes(hotelCheckoutAt.getMinutes() - 120);

      results.push({
        originIata,
        destinationId: destinationIata,
        destinationName,
        outbound,
        inbound,
        isOpenJaw: false,
        interCityTransfer: null,
        totalPrice,
        currency: 'EUR',
        hotelCheckoutAt: hotelCheckoutAt.toISOString(),
        airportTransferMinutes: 45,
        notes: [
          'Precio de Sky Scrapper (RapidAPI), fuente adicional a Ignav -- verificar antes de reservar.',
          'Sky Scrapper no da hora de salida del hotel calculada con dato real de traslado; se ha usado una estimacion generica (45 min).'
        ],
        source: 'skyscanner'
      });
    }

    return results;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    warnings.push(`[Sky Scrapper] ${originIata} <-> ${destinationIata}: ${message}`);
    return [];
  }
}
