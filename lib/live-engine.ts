import { sql } from './db';
import { searchOneWay, type IgnavItinerary, type IgnavOneWayResponse } from './ignav';
import type { Pax } from './types';
import { datesBetween } from './types';

const AIRPORT_BUFFER_MIN = 120;
const MAX_DATE_RANGE_DAYS = 5;
const MAX_ORIGIN_GROUP_COMBOS = 6;
// Limite conservador sobre el numero REAL de peticiones a Ignav por busqueda (no solo
// combos origen x destino). Con una cuota de 1000 peticiones de por vida, este tope evita
// que una sola busqueda con destinos multi-aeropuerto y rango de fechas amplio se lleve
// una parte desproporcionada de la cuota de golpe.
const MAX_IGNAV_REQUESTS_PER_SEARCH = 60;

export type LiveFilters = {
  originIatas: string[];
  destinationGroupIds: string[];
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
  maxPriceTotal?: number;
  airlinesInclude?: string[];
  airlinesExclude?: string[];
  sortBy: 'checkout_time' | 'price' | 'duration';
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
  destinationGroupId: string;
  destinationGroupName: string;
  isSingleIataTarget?: boolean;
  outbound: LiveLeg;
  inbound: LiveLeg;
  isOpenJaw: boolean;
  interCityTransfer?: { mode: string; duration_min: number; price_eur: number | null } | null;
  totalPrice: number;
  currency: string;
  hotelCheckoutAt: string;
  airportTransferMinutes: number;
  notes: string[];
};

export type LiveSearchResult = {
  itineraries: LiveItinerary[];
  warnings: string[];
};

type DestinationTarget = {
  id: string;
  name: string;
  isSingleIataTarget: boolean;
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

async function resolveGroupTargets(destinationGroupIds: string[]): Promise<DestinationTarget[]> {
  const targets: DestinationTarget[] = [];
  for (const groupId of destinationGroupIds) {
    const groupRows = (await sql`
      SELECT iata, city FROM airports WHERE group_id = ${groupId}
    `) as { iata: string; city: string }[];
    const groupNameRows = (await sql`SELECT name FROM destination_groups WHERE id = ${groupId} LIMIT 1`) as { name: string }[];
    if (groupRows.length === 0) continue;
    targets.push({
      id: groupId,
      name: groupNameRows[0]?.name ?? groupId,
      isSingleIataTarget: false,
      airports: groupRows
    });
  }
  return targets;
}

async function resolveIataTargets(destinationIatas: string[]): Promise<DestinationTarget[]> {
  const targets: DestinationTarget[] = [];
  for (const iata of destinationIatas) {
    const rows = (await sql`
      SELECT dest_name, country FROM aena_destinations WHERE dest_iata = ${iata} LIMIT 1
    `) as { dest_name: string; country: string }[];
    const cityName = rows[0]?.dest_name ?? iata;
    const displayName = rows[0] ? `${rows[0].dest_name} (${rows[0].country})` : iata;
    targets.push({
      id: iata,
      name: displayName,
      isSingleIataTarget: true,
      airports: [{ iata, city: cityName }]
    });
  }
  return targets;
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
    maxPriceTotal,
    airlinesInclude,
    airlinesExclude
  } = filters;

  const outboundDates = datesBetween(outboundDateFrom, outboundDateTo);
  const inboundDates = datesBetween(inboundDateFrom, inboundDateTo);

  const groupRows = target.airports;
  const groupName = target.name;
  if (groupRows.length === 0) return [];

  const cityByIata = new Map(groupRows.map((a) => [a.iata, a.city]));
  const minCarryOn = requireCabinBaggage ? 1 : undefined;

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
            airlines_include: airlinesInclude,
            airlines_exclude: airlinesExclude,
            departure_time_range: outboundNotBeforeHour !== undefined ? { earliest_hour: outboundNotBeforeHour } : undefined
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
            airlines_include: airlinesInclude,
            airlines_exclude: airlinesExclude,
            departure_time_range: inboundNotBeforeHour !== undefined ? { earliest_hour: inboundNotBeforeHour } : undefined
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
      if (new Date(inbound.departure_at) <= new Date(outbound.departure_at)) continue;

      const isOpenJaw = outbound.destination_iata !== inbound.origin_iata;
      if (isOpenJaw && !allowOpenJaw) continue;

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
      if (target.isSingleIataTarget) {
        notes.push('Destino fuera de los grupos curados (tomado del listado real de Aena); verifica manualmente eventos/temporada en destino.');
      }
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
        destinationGroupId: target.id,
        destinationGroupName: groupName,
        isSingleIataTarget: target.isSingleIataTarget,
        outbound,
        inbound,
        isOpenJaw,
        interCityTransfer,
        totalPrice,
        currency: outbound.price_currency,
        hotelCheckoutAt,
        airportTransferMinutes,
        notes
      });
    }
  }

  return results;
}

export async function searchLiveItineraries(filters: LiveFilters): Promise<LiveSearchResult> {
  const { originIatas, destinationGroupIds, destinationIatas } = filters;
  const sortBy = filters.sortBy;

  const outboundDates = datesBetween(filters.outboundDateFrom, filters.outboundDateTo);
  const inboundDates = datesBetween(filters.inboundDateFrom, filters.inboundDateTo);
  if (outboundDates.length > MAX_DATE_RANGE_DAYS || inboundDates.length > MAX_DATE_RANGE_DAYS) {
    throw new Error(`El rango de fechas maximo permitido en modo Ignav es de ${MAX_DATE_RANGE_DAYS} dias por tramo.`);
  }

  const [groupTargets, iataTargets] = await Promise.all([
    resolveGroupTargets(destinationGroupIds ?? []),
    resolveIataTargets(destinationIatas ?? [])
  ]);
  const allTargets = [...groupTargets, ...iataTargets];

  const combos = originIatas.length * allTargets.length;
  if (combos > MAX_ORIGIN_GROUP_COMBOS) {
    throw new Error(
      `Has seleccionado ${originIatas.length} origen(es) x ${allTargets.length} destino(s) = ${combos} combinaciones. El maximo permitido en modo Ignav es ${MAX_ORIGIN_GROUP_COMBOS}, para proteger tu cuota gratuita. Reduce el numero de origenes o destinos seleccionados.`
    );
  }
  if (combos === 0) {
    throw new Error('No hay destinos seleccionados (ni grupos curados ni destinos IATA sueltos).');
  }

  // El cap de MAX_ORIGIN_GROUP_COMBOS de arriba NO limita el multiplicador real de
  // peticiones a Ignav: un grupo de destino con varios aeropuertos (ej. Polonia: 4)
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

  merged.sort((a, b) => {
    if (sortBy === 'price') return a.totalPrice - b.totalPrice;
    if (sortBy === 'duration') return a.outbound.duration_min + a.inbound.duration_min - (b.outbound.duration_min + b.inbound.duration_min);
    return new Date(b.hotelCheckoutAt).getTime() - new Date(a.hotelCheckoutAt).getTime();
  });

  return { itineraries: merged, warnings };
}
