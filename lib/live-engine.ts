import { sql } from './db';
import { searchOneWay, type IgnavItinerary, type IgnavOneWayResponse } from './ignav';
import { searchSkyRoundTrip } from './skyscanner-adapter';
import type { Pax } from './types';
import { datesBetween } from './types';
import { getIgnavUsageSummary, dynamicComboLimit } from './ignav-usage';
import { logPriceObservation, getPriceTrend, type PriceTrend } from './price-history';
import { getAirportGeo } from './airport-geo';
import { estimateCo2, type Co2Estimate } from './co2';
import { getTypicalClimate, type ClimateSummary } from './weather';
import { getExchangeRateFromEur, type ExchangeRate } from './exchange-rate';
import { getHolidaysInRange, type Holiday } from './holidays';

const AIRPORT_BUFFER_MIN = 120;
const MAX_DATE_RANGE_DAYS = 5;
const MAX_ORIGIN_DESTINATION_COMBOS = 6;
// Limite conservador sobre el numero REAL de peticiones a Ignav por busqueda (no solo
// combos origen x destino). Con una cuota de 1000 peticiones de por vida, este tope evita
// que una sola busqueda con destinos multi-aeropuerto y rango de fechas amplio se lleve
// una parte desproporcionada de la cuota de golpe.
const MAX_IGNAV_REQUESTS_PER_SEARCH = 60;
// Sky Scrapper (RapidAPI) tiene una cuota MUCHO mas ajustada que Ignav: ~100 peticiones
// AL MES (no de por vida). Por eso, a diferencia de Ignav, solo se consulta 1 vez por
// combinacion origen x aeropuerto de destino (usando la PRIMERA fecha de cada rango, no
// el rango completo) y con un tope mucho mas bajo. Es opcional (checkbox) y silencioso
// si RAPIDAPI_SKY_SCRAPPER_KEY no esta configurada.
const MAX_SKYSCANNER_CALLS_PER_SEARCH = 6;

export type LiveFilters = {
  originIatas: string[];
  destinationIatas?: string[];
  outboundDateFrom: string;
  outboundDateTo: string;
  inboundDateFrom: string;
  inboundDateTo: string;
  pax: Pax;
  requireCabinBaggage: boolean;
  allowOpenJaw: boolean;
  outboundNotBeforeHour?: number;
  inboundNotBeforeHour?: number;
  outboundNotAfterHour?: number;
  inboundNotAfterHour?: number;
  outboundDates?: string[];
  inboundDates?: string[];
  outboundDayHours?: Record<string, { before?: number; after?: number }>;
  inboundDayHours?: Record<string, { before?: number; after?: number }>;
  maxPriceTotal?: number;
  airlinesInclude?: string[];
  airlinesExclude?: string[];
  sortBy: 'checkout_time' | 'price' | 'duration';
  includeSkyScanner?: boolean;
};

export type LiveLeg = {
  origin_iata: string;
  destination_iata: string;
  airline: string;
  flight_number: string;
  departure_at: string;
  arrival_at: string;
  duration_min: number;
  price_amount: number;
  price_currency: string;
  price_status: 'verified' | 'unverified';
  cabin_baggage_included: boolean | null;
  checked_baggage_included: boolean | null;
  requires_self_transfer: boolean;
  ignav_id: string;
};

export type LiveItinerary = {
  originIata: string;
  destinationId: string;
  destinationName: string;
  outbound: LiveLeg;
  inbound: LiveLeg;
  isOpenJaw: boolean;
  interCityTransfer?: { mode: string; duration_min: number; price_eur: number | null } | null;
  totalPrice: number;
  currency: string;
  hotelCheckoutAt: string;
  airportTransferMinutes: number;
  notes: string[];
  source: 'ignav' | 'skyscanner';
  priceTrend?: PriceTrend | null;
  cheaperOtherDay?: { date: string; price: number; savings: number } | null;
  co2Estimate?: Co2Estimate | null;
  climate?: ClimateSummary | null;
  exchangeRate?: ExchangeRate | null;
  holidays?: Holiday[];
};

export type LiveSearchResult = {
  itineraries: LiveItinerary[];
  warnings: string[];
};

type DestinationTarget = {
  id: string;
  name: string;
  airports: { iata: string; city: string }[];
};

function itineraryToLeg(it: IgnavItinerary): LiveLeg | null {
  const legObj = it.outbound;
  if (!legObj || legObj.segments.length !== 1) return null;
  const seg = legObj.segments[0];
  return {
    origin_iata: seg.departure_airport,
    destination_iata: seg.arrival_airport,
    airline: seg.operating_carrier_name ?? seg.marketing_carrier_code ?? 'Desconocida',
    flight_number: `${seg.marketing_carrier_code ?? ''}${seg.flight_number ?? ''}`,
    departure_at: seg.departure_time_utc ?? seg.departure_time_local,
    arrival_at: seg.arrival_time_utc ?? seg.arrival_time_local,
    duration_min: legObj.duration_minutes ?? seg.duration_minutes,
    price_amount: it.price.amount,
    price_currency: it.price.currency,
    price_status: it.price.status,
    cabin_baggage_included: it.bags?.carry_on !== undefined ? it.bags.carry_on > 0 : null,
    checked_baggage_included: it.bags?.checked !== undefined ? it.bags.checked > 0 : null,
    requires_self_transfer: it.requires_self_transfer,
    ignav_id: it.ignav_id
  };
}

function addMinutes(iso: string, minutes: number): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - minutes);
  return d.toISOString();
}

/**
 * Comprueba si un tramo coincide con alguna entrada de una lista de aerolineas, por
 * nombre (substring, sin distinguir mayusculas) o por codigo de 2-3 letras al inicio
 * del numero de vuelo (ej. "FR" en "FR1234"). Red de seguridad ademas de mandar el
 * filtro a Ignav (airlines_include/airlines_exclude): no se ha podido verificar contra
 * la API real si Ignav lo aplica exactamente como se espera, asi que se re-comprueba
 * aqui sobre el resultado final, igual que ya se hace con "solo directos".
 */
function legMatchesAirlineList(list: string[], leg: LiveLeg): boolean {
  const code = (leg.flight_number.match(/^[A-Z0-9]{2,3}/)?.[0] ?? '').toUpperCase();
  const name = leg.airline.toLowerCase();
  return list.some((entry) => {
    const e = entry.trim();
    if (!e) return false;
    return name.includes(e.toLowerCase()) || code === e.toUpperCase();
  });
}

async function safeSearchOneWay(
  params: Parameters<typeof searchOneWay>[0],
  warnings: string[]
): Promise<IgnavOneWayResponse> {
  try {
    return await searchOneWay(params);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido llamando a Ignav';
    warnings.push(`${params.origin}->${params.destination} (${params.departure_date}): ${message}`);
    return { origin: params.origin, destination: params.destination, departure_date: params.departure_date, itineraries: [] };
  }
}

async function resolveDestinationTargets(destinationIatas: string[]): Promise<DestinationTarget[]> {
  if (destinationIatas.length === 0) return [];
  const rows = (await sql`
    SELECT dest_iata, dest_name, country FROM aena_destinations WHERE dest_iata = ANY(${destinationIatas}::text[])
  `) as { dest_iata: string; dest_name: string; country: string }[];
  const byIata = new Map(rows.map((r) => [r.dest_iata, r]));

  // Agrupa por el nombre de ciudad antes de la barra (ej. "Londres/Gatwick" y
  // "Londres/Stansted" -> "Londres"), igual que el selector "ciudad (todos)" del
  // formulario -- si el usuario elige varios aeropuertos de la misma ciudad, cuentan
  // como 1 sola combinacion y se permite open-jaw real entre ellos.
  const groups = new Map<string, { name: string; airports: { iata: string; city: string }[] }>();
  for (const iata of destinationIatas) {
    const row = byIata.get(iata);
    const fullName = row ? `${row.dest_name} (${row.country})` : iata;
    const cityKey = row ? row.dest_name.split('/')[0].trim() : iata;
    if (!groups.has(cityKey)) groups.set(cityKey, { name: fullName, airports: [] });
    groups.get(cityKey)!.airports.push({ iata, city: cityKey });
  }

  return Array.from(groups.entries()).map(([cityKey, g]) => ({
    id: g.airports.map((a) => a.iata).join('+'),
    name: g.airports.length > 1 ? cityKey : g.name,
    airports: g.airports
  }));
}

async function searchLiveForTarget(
  originIata: string,
  target: DestinationTarget,
  filters: LiveFilters,
  warnings: string[]
): Promise<LiveItinerary[]> {
  const {
    outboundDateFrom,
    outboundDateTo,
    inboundDateFrom,
    inboundDateTo,
    pax,
    requireCabinBaggage,
    allowOpenJaw,
    outboundNotBeforeHour,
    inboundNotBeforeHour,
    outboundNotAfterHour,
    inboundNotAfterHour,
    outboundDates: explicitOutboundDates,
    inboundDates: explicitInboundDates,
    outboundDayHours,
    inboundDayHours,
    maxPriceTotal,
    airlinesInclude,
    airlinesExclude
  } = filters;

  // Dias sueltos, NO necesariamente contiguos (peticion real: "poder elegir mas un dia
  // o menos un dia de forma independiente") -- si el cliente manda una lista explicita
  // de dias, se usa tal cual en vez de generar el rango completo dia a dia con
  // datesBetween. Se mantiene datesBetween como fallback por compatibilidad con quien
  // siga mandando solo el rango (cron de alertas, por ejemplo).
  const outboundDates = explicitOutboundDates?.length ? explicitOutboundDates : datesBetween(outboundDateFrom, outboundDateTo);
  const inboundDates = explicitInboundDates?.length ? explicitInboundDates : datesBetween(inboundDateFrom, inboundDateTo);

  const groupRows = target.airports;
  const groupName = target.name;
  if (groupRows.length === 0) return [];

  const cityByIata = new Map(groupRows.map((a) => [a.iata, a.city]));
  const minCarryOn = requireCabinBaggage ? 1 : undefined;
  // FIX critico (bug reportado: TODAS las busquedas fallaban con error 400 de Ignav):
  // airlinesInclude/airlinesExclude llegan como array VACIO [] (no undefined) cuando el
  // usuario no rellena el filtro -- Ignav rechaza un array vacio explicito
  // ("airlines_include must include at least one airline code when provided"). Se
  // omite el campo entero cuando esta vacio, en vez de mandar [].
  const safeAirlinesInclude = airlinesInclude?.length ? airlinesInclude : undefined;
  const safeAirlinesExclude = airlinesExclude?.length ? airlinesExclude : undefined;

  const outboundCalls: Promise<IgnavOneWayResponse>[] = [];
  for (const a of groupRows) {
    for (const date of outboundDates) {
      outboundCalls.push(
        safeSearchOneWay(
          {
            origin: originIata,
            destination: a.iata,
            departure_date: date,
            adults: pax.adults,
            children: pax.children,
            max_stops: 0,
            min_carry_on_bags: minCarryOn,
            airlines_include: safeAirlinesInclude,
            airlines_exclude: safeAirlinesExclude,
            departure_time_range: (() => {
              const dayOverride = outboundDayHours?.[date];
              const earliest = dayOverride?.before ?? outboundNotBeforeHour;
              const latest = dayOverride?.after ?? outboundNotAfterHour;
              return earliest !== undefined || latest !== undefined ? { earliest_hour: earliest, latest_hour: latest } : undefined;
            })()
          },
          warnings
        )
      );
    }
  }

  const inboundCalls: Promise<IgnavOneWayResponse>[] = [];
  for (const a of groupRows) {
    for (const date of inboundDates) {
      inboundCalls.push(
        safeSearchOneWay(
          {
            origin: a.iata,
            destination: originIata,
            departure_date: date,
            adults: pax.adults,
            children: pax.children,
            max_stops: 0,
            min_carry_on_bags: minCarryOn,
            airlines_include: safeAirlinesInclude,
            airlines_exclude: safeAirlinesExclude,
            departure_time_range: (() => {
              const dayOverride = inboundDayHours?.[date];
              const earliest = dayOverride?.before ?? inboundNotBeforeHour;
              const latest = dayOverride?.after ?? inboundNotAfterHour;
              return earliest !== undefined || latest !== undefined ? { earliest_hour: earliest, latest_hour: latest } : undefined;
            })()
          },
          warnings
        )
      );
    }
  }

  const [outboundResponses, inboundResponses] = await Promise.all([Promise.all(outboundCalls), Promise.all(inboundCalls)]);

  const outboundLegs: LiveLeg[] = [];
  for (const resp of outboundResponses) for (const it of resp.itineraries) { const leg = itineraryToLeg(it); if (leg) outboundLegs.push(leg); }

  const inboundLegs: LiveLeg[] = [];
  for (const resp of inboundResponses) for (const it of resp.itineraries) { const leg = itineraryToLeg(it); if (leg) inboundLegs.push(leg); }

  if (outboundLegs.length === 0) warnings.push(`[${originIata} -> ${groupName}] Ignav no devolvio vuelos de ida directos.`);
  if (inboundLegs.length === 0) warnings.push(`[${groupName} -> ${originIata}] Ignav no devolvio vuelos de vuelta directos.`);

  // FIX (auditoria): antes se hacian 1-2 consultas SQL secuenciales POR CADA combinacion
  // ida x vuelta dentro del doble bucle (clasico N+1) -- con pocos legs no se nota, pero
  // segun crezca el numero de vuelos devueltos por Ignav esto puede sumar decenas/cientos
  // de round-trips secuenciales y contribuir a los mismos timeouts de 10s de Vercel Hobby
  // que ya dan problemas en el cron de Aena. Ahora se precargan en batch (maximo 2 consultas
  // por destino, independientemente de cuantas combinaciones haya) y se consultan en memoria.
  const distinctOutboundDest = Array.from(new Set(outboundLegs.map((l) => l.destination_iata)));
  const distinctInboundOrigin = Array.from(new Set(inboundLegs.map((l) => l.origin_iata)));

  const transferTimesMap = new Map<string, { mode: string; duration_min: number; price_eur: number | null }>();
  if (distinctOutboundDest.length > 0 && distinctInboundOrigin.length > 0) {
    const transferRows = (await sql`
      SELECT origin_iata, destination_iata, mode, duration_min, price_eur
      FROM transfer_times
      WHERE origin_iata = ANY(${distinctOutboundDest}::text[]) AND destination_iata = ANY(${distinctInboundOrigin}::text[])
      ORDER BY duration_min ASC
    `) as { origin_iata: string; destination_iata: string; mode: string; duration_min: number; price_eur: string | null }[];
    for (const row of transferRows) {
      const key = `${row.origin_iata}->${row.destination_iata}`;
      // ORDER BY duration_min ASC + solo guardar la primera vista = la mas rapida (misma logica que el LIMIT 1 original)
      if (!transferTimesMap.has(key)) {
        transferTimesMap.set(key, { mode: row.mode, duration_min: row.duration_min, price_eur: row.price_eur ? Number(row.price_eur) : null });
      }
    }
  }

  const hotelTransferMap = new Map<string, number>();
  if (distinctInboundOrigin.length > 0) {
    const hotelRows = (await sql`
      SELECT airport_iata, airport_to_center_min FROM hotel_transfer WHERE airport_iata = ANY(${distinctInboundOrigin}::text[])
    `) as { airport_iata: string; airport_to_center_min: number }[];
    for (const row of hotelRows) hotelTransferMap.set(row.airport_iata, row.airport_to_center_min);
  }

  const results: LiveItinerary[] = [];

  for (const outbound of outboundLegs) {
    for (const inbound of inboundLegs) {
      if (new Date(inbound.departure_at) <= new Date(outbound.arrival_at)) continue;

      const isOpenJaw = outbound.destination_iata !== inbound.origin_iata;
      if (isOpenJaw && !allowOpenJaw) continue;

      if (airlinesInclude?.length && !(legMatchesAirlineList(airlinesInclude, outbound) || legMatchesAirlineList(airlinesInclude, inbound))) {
        continue;
      }
      if (airlinesExclude?.length && (legMatchesAirlineList(airlinesExclude, outbound) || legMatchesAirlineList(airlinesExclude, inbound))) {
        continue;
      }

      let interCityTransfer: LiveItinerary['interCityTransfer'] = null;
      if (isOpenJaw) {
        const found = transferTimesMap.get(`${outbound.destination_iata}->${inbound.origin_iata}`);
        if (found) interCityTransfer = found;
      }

      const totalPax = pax.adults + pax.children;
      const totalPrice = outbound.price_amount + inbound.price_amount + (interCityTransfer?.price_eur ?? 0) * totalPax;
      if (maxPriceTotal !== undefined && totalPrice > maxPriceTotal) continue;

      const airportTransferMinutes = hotelTransferMap.get(inbound.origin_iata) ?? 45;
      const hotelCheckoutAt = addMinutes(inbound.departure_at, AIRPORT_BUFFER_MIN + airportTransferMinutes);

      const notes: string[] = [];
      notes.push(
        outbound.price_status === 'verified' && inbound.price_status === 'verified'
          ? 'Precio verificado por Ignav en el momento de la busqueda.'
          : 'Precio ESTIMADO (no verificado) por Ignav; confirmar antes de reservar.'
      );
      if (outbound.requires_self_transfer || inbound.requires_self_transfer) {
        notes.push('Aviso: un tramo puede requerir self-transfer (billetes separados); revisar antes de reservar.');
      }
      if (isOpenJaw) {
        const fromCity = cityByIata.get(outbound.destination_iata) ?? outbound.destination_iata;
        const toCity = cityByIata.get(inbound.origin_iata) ?? inbound.origin_iata;
        notes.push(
          `Open-jaw: llegas a ${fromCity} y sales desde ${toCity}.` +
            (interCityTransfer ? ` Traslado interno estimado: ${interCityTransfer.duration_min} min en ${interCityTransfer.mode}.` : ' Sin dato de traslado interno registrado; verificar manualmente.')
        );
      }
      if (outbound.cabin_baggage_included === null || inbound.cabin_baggage_included === null) {
        notes.push('Ignav no especifica equipaje de mano para esta tarifa; verificar manualmente antes de reservar.');
      } else if (!outbound.cabin_baggage_included || !inbound.cabin_baggage_included) {
        notes.push('Aviso: la tarifa puede no incluir equipaje de mano tipo trolley.');
      }

      results.push({
        originIata,
        destinationId: target.id,
        destinationName: groupName,
        outbound,
        inbound,
        isOpenJaw,
        interCityTransfer,
        totalPrice,
        currency: outbound.price_currency,
        hotelCheckoutAt,
        airportTransferMinutes,
        notes,
        source: 'ignav'
      });
    }
  }

  return results;
}

export async function searchLiveItineraries(filters: LiveFilters): Promise<LiveSearchResult> {
  const { originIatas, destinationIatas } = filters;
  const sortBy = filters.sortBy;

  const outboundDates = filters.outboundDates?.length ? filters.outboundDates : datesBetween(filters.outboundDateFrom, filters.outboundDateTo);
  const inboundDates = filters.inboundDates?.length ? filters.inboundDates : datesBetween(filters.inboundDateFrom, filters.inboundDateTo);
  if (outboundDates.length > MAX_DATE_RANGE_DAYS || inboundDates.length > MAX_DATE_RANGE_DAYS) {
    throw new Error(`El maximo de dias sueltos permitido en modo Ignav es de ${MAX_DATE_RANGE_DAYS} por tramo.`);
  }

  const allTargets = await resolveDestinationTargets(destinationIatas ?? []);

  // Limite dinamico segun cuota restante de Ignav (en vez del fijo de 6 de siempre):
  // generoso si queda mucha cuota, conservador si queda poca. Si el contador de cuota
  // no esta disponible todavia (tabla ignav_usage_log sin crear -- migracion
  // pendiente), se cae al limite fijo de 6 de toda la vida, sin romper nada.
  let comboLimit = MAX_ORIGIN_DESTINATION_COMBOS;
  try {
    const usage = await getIgnavUsageSummary();
    comboLimit = dynamicComboLimit(usage.remaining, usage.quota);
  } catch {
    // Sin contador disponible -- limite fijo de siempre.
  }

  const combos = originIatas.length * allTargets.length;
  if (combos > comboLimit) {
    throw new Error(
      `Has seleccionado ${originIatas.length} origen(es) x ${allTargets.length} destino(s) = ${combos} combinaciones. El maximo permitido ahora mismo es ${comboLimit} (varia segun tu cuota restante de Ignav), para proteger tu cuota gratuita. Reduce el numero de origenes o destinos seleccionados.`
    );
  }
  if (combos === 0) {
    throw new Error('No hay destinos seleccionados.');
  }

  // El cap de arriba NO limita el multiplicador real de
  // peticiones a Ignav: un destino con varios aeropuertos en la misma ciudad (ej.
  // Londres: hasta 4)
  // dispara una peticion por aeropuerto x fecha x sentido. Con el maximo de 5 dias de
  // rango y 6 combos, un solo click podia llegar a 4 aeropuertos x 5 dias x 2 x 6 combos
  // = 240 peticiones de golpe contra una cuota de 1000 de por vida (no mensual). Se
  // calcula aqui el numero real antes de lanzar nada.
  const estimatedRequests =
    originIatas.length *
    allTargets.reduce((sum, t) => sum + t.airports.length * (outboundDates.length + inboundDates.length), 0);
  if (estimatedRequests > MAX_IGNAV_REQUESTS_PER_SEARCH) {
    throw new Error(
      `Esta busqueda lanzaria aproximadamente ${estimatedRequests} peticiones a Ignav (aeropuertos del destino x dias de rango x 2 x combinaciones), por encima del limite de ${MAX_IGNAV_REQUESTS_PER_SEARCH} por busqueda que protege tu cuota de 1000 peticiones DE POR VIDA. Reduce el rango de fechas, el numero de destinos con varios aeropuertos, o los origenes seleccionados.`
    );
  }

  const warnings: string[] = [];
  const allResults: LiveItinerary[][] = await Promise.all(
    originIatas.flatMap((originIata) => allTargets.map((target) => searchLiveForTarget(originIata, target, filters, warnings)))
  );

  const merged = allResults.flat();

  // Sky Scrapper (RapidAPI) como fuente ADICIONAL, opcional (checkbox), silenciosa si no
  // hay key configurada. A diferencia de Ignav, aqui NO se recorre el rango de fechas
  // completo -- solo la primera fecha de ida y la primera de vuelta -- porque su cuota es
  // ~100/mes (no de por vida como Ignav) y una sola busqueda con rango de dias la
  // agotaria en un instante. Los resultados se mezclan con los de Ignav y cada uno lleva
  // su `source` para que la interfaz pueda distinguirlos, tal como se pidio.
  if (filters.includeSkyScanner && process.env.RAPIDAPI_SKY_SCRAPPER_KEY) {
    const skyPairs: { originIata: string; destIata: string; destName: string }[] = [];
    for (const originIata of originIatas) {
      for (const target of allTargets) {
        for (const airport of target.airports) {
          skyPairs.push({ originIata, destIata: airport.iata, destName: target.name });
          if (skyPairs.length >= MAX_SKYSCANNER_CALLS_PER_SEARCH) break;
        }
        if (skyPairs.length >= MAX_SKYSCANNER_CALLS_PER_SEARCH) break;
      }
      if (skyPairs.length >= MAX_SKYSCANNER_CALLS_PER_SEARCH) break;
    }

    const skyResults = await Promise.all(
      skyPairs.map((p) =>
        searchSkyRoundTrip(p.originIata, p.destIata, outboundDates[0], inboundDates[0], filters.pax, p.originIata, p.destName, warnings)
      )
    );
    merged.push(...skyResults.flat());

    if (skyPairs.length > 0) {
      warnings.push(
        `Sky Scrapper consultado solo para ${outboundDates[0]} (ida) / ${inboundDates[0]} (vuelta) -- su cuota es mensual y mucho mas ajustada que la de Ignav, no se recorre el rango de fechas completo.`
      );
    }
  }

  merged.sort((a, b) => {
    if (sortBy === 'price') return a.totalPrice - b.totalPrice;
    if (sortBy === 'duration') {
      const da = new Date(a.inbound.arrival_at).getTime() - new Date(a.outbound.departure_at).getTime();
      const db = new Date(b.inbound.arrival_at).getTime() - new Date(b.outbound.departure_at).getTime();
      return da - db;
    }
    return new Date(b.hotelCheckoutAt).getTime() - new Date(a.hotelCheckoutAt).getTime();
  });

  // Tendencia de precio (bajo/normal/alto) sobre historial propio -- se calcula para
  // cada resultado antes de devolver, en paralelo. Registrar el precio observado ahora
  // NO se espera (fire-and-forget): alimenta las busquedas FUTURAS, no la respuesta
  // actual, y no debe anadir latencia a la busqueda de ahora mismo.
  await Promise.all(
    merged.map(async (item) => {
      item.priceTrend = await getPriceTrend(item.originIata, item.destinationId, item.totalPrice);
      void logPriceObservation(item.originIata, item.destinationId, item.outbound.departure_at.slice(0, 10), item.totalPrice, item.currency);
    })
  );

  // "Sale mas barato otro dia": NO gasta ninguna peticion nueva -- la propia busqueda
  // ya prueba varias fechas dentro del rango elegido, asi que basta con comparar los
  // resultados YA obtenidos entre si para la MISMA pareja origen-destino.
  for (const item of merged) {
    const itemDate = item.outbound.departure_at.slice(0, 10);
    let cheaperDate: string | null = null;
    let cheaperPrice: number | null = null;
    for (const other of merged) {
      if (other === item) continue;
      if (other.originIata !== item.originIata || other.destinationId !== item.destinationId) continue;
      const otherDate = other.outbound.departure_at.slice(0, 10);
      if (otherDate === itemDate) continue;
      if (other.totalPrice < item.totalPrice && (cheaperPrice === null || other.totalPrice < cheaperPrice)) {
        cheaperPrice = other.totalPrice;
        cheaperDate = otherDate;
      }
    }
    // Solo se avisa si el ahorro es significativo (>= 10), para no llenar la interfaz
    // de avisos por diferencias de 1-2 euros que no cambian ninguna decision real.
    if (cheaperDate && cheaperPrice !== null && item.totalPrice - cheaperPrice >= 10) {
      item.cheaperOtherDay = { date: cheaperDate, price: cheaperPrice, savings: Math.round(item.totalPrice - cheaperPrice) };
    }
  }

  // CO2 (sin API, solo geometria), clima habitual, tipo de cambio y festivos -- una
  // sola vez por cada pareja origen-destino UNICA (no por cada resultado individual,
  // que podria repetir la misma pareja en varias fechas), todo en paralelo y
  // best-effort: si una de las 3 APIs externas falla o esta lenta, el resto sigue
  // funcionando y la busqueda nunca se rompe por esto.
  const uniquePairs = new Map<string, LiveItinerary[]>();
  for (const item of merged) {
    const key = `${item.originIata}|${item.destinationId}`;
    if (!uniquePairs.has(key)) uniquePairs.set(key, []);
    uniquePairs.get(key)!.push(item);
  }

  const enrichmentPairs = Array.from(uniquePairs.values()).map(async (items) => {
    const [first] = items;
    const primaryIata = first.destinationId.split('+')[0];
    const geo = getAirportGeo(primaryIata);
    const co2 = estimateCo2(first.originIata, primaryIata);

    const outboundDates = items.map((i) => i.outbound.departure_at.slice(0, 10)).sort();
    const earliestDate = outboundDates[0];
    const latestDate = outboundDates[outboundDates.length - 1];
    const [, m, d] = earliestDate.split('-').map(Number);
    const spanDays = Math.max(1, Math.round((new Date(latestDate).getTime() - new Date(earliestDate).getTime()) / 86400000) + 1);

    const isDomesticSpain = geo?.country === 'ES';
    const [climate, holidaysES, holidaysDest, exchange] = await Promise.all([
      getTypicalClimate(primaryIata, { month: m, day: d }, spanDays).catch(() => null),
      getHolidaysInRange('ES', earliestDate, latestDate).catch(() => []),
      geo && !isDomesticSpain ? getHolidaysInRange(geo.country, earliestDate, latestDate).catch(() => []) : Promise.resolve([]),
      geo ? getExchangeRateFromEur(geo.country).catch(() => null) : Promise.resolve(null)
    ]);

    for (const item of items) {
      item.co2Estimate = co2;
      item.climate = climate;
      item.exchangeRate = exchange;
      item.holidays = [...holidaysES, ...holidaysDest];
    }
  });

  // Tope duro sobre TODO el enriquecimiento externo (clima + festivos + tipo de
  // cambio): con timeouts individuales de 3-4s por llamada, en el peor caso (varias
  // parejas origen-destino, alguna API lenta) podia sumar varios segundos MAS al
  // tiempo ya consumido por la busqueda real a Ignav -- arriesgando el limite de
  // funcion de Vercel (10s en el plan Hobby) y haciendo fallar busquedas que hoy
  // funcionan bien, solo por unos datos que son un plus, no algo critico. Si el tope
  // salta, las parejas que no hayan terminado se quedan sin esos campos (todos
  // opcionales en el tipo) -- la busqueda en si nunca se ve afectada.
  await Promise.race([Promise.all(enrichmentPairs), new Promise((resolve) => setTimeout(resolve, 4500))]);

  return { itineraries: merged, warnings };
}
