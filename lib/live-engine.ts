import { sql } from './db';
import { searchOneWay, type IgnavItinerary } from './ignav';
import type { Pax } from './types';

const AIRPORT_BUFFER_MIN = 120;

export type LiveFilters = {
  originIata: string;
  destinationGroupId: string;
  outboundDate: string;
  inboundDate: string;
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

export async function searchLiveItineraries(filters: LiveFilters): Promise<LiveItinerary[]> {
  const {
    originIata,
    destinationGroupId,
    outboundDate,
    inboundDate,
    pax,
    requireCabinBaggage,
    allowOpenJaw,
    outboundNotBeforeHour,
    inboundNotBeforeHour,
    maxPriceTotal,
    airlinesInclude,
    airlinesExclude,
    sortBy
  } = filters;

  const groupAirports = (await sql`
    SELECT iata, city FROM airports WHERE group_id = ${destinationGroupId}
  `) as { iata: string; city: string }[];
  if (groupAirports.length === 0) return [];

  const cityByIata = new Map(groupAirports.map((a) => [a.iata, a.city]));
  const minCarryOn = requireCabinBaggage ? 1 : undefined;

  const outboundCalls = groupAirports.map((a) =>
    searchOneWay({
      origin: originIata,
      destination: a.iata,
      departure_date: outboundDate,
      adults: pax.adults,
      children: pax.children,
      max_stops: 0,
      min_carry_on_bags: minCarryOn,
      airlines_include: airlinesInclude,
      airlines_exclude: airlinesExclude,
      departure_time_range: outboundNotBeforeHour !== undefined ? { earliest_hour: outboundNotBeforeHour } : undefined
    }).catch(() => ({ origin: originIata, destination: a.iata, departure_date: outboundDate, itineraries: [] }))
  );

  const inboundCalls = groupAirports.map((a) =>
    searchOneWay({
      origin: a.iata,
      destination: originIata,
      departure_date: inboundDate,
      adults: pax.adults,
      children: pax.children,
      max_stops: 0,
      min_carry_on_bags: minCarryOn,
      airlines_include: airlinesInclude,
      airlines_exclude: airlinesExclude,
      departure_time_range: inboundNotBeforeHour !== undefined ? { earliest_hour: inboundNotBeforeHour } : undefined
    }).catch(() => ({ origin: a.iata, destination: originIata, departure_date: inboundDate, itineraries: [] }))
  );

  const [outboundResponses, inboundResponses] = await Promise.all([
    Promise.all(outboundCalls),
    Promise.all(inboundCalls)
  ]);

  const outboundLegs: LiveLeg[] = [];
  for (const resp of outboundResponses) {
    for (const it of resp.itineraries) {
      const leg = itineraryToLeg(it);
      if (leg) outboundLegs.push(leg);
    }
  }

  const inboundLegs: LiveLeg[] = [];
  for (const resp of inboundResponses) {
    for (const it of resp.itineraries) {
      const leg = itineraryToLeg(it);
      if (leg) inboundLegs.push(leg);
    }
  }

  const results: LiveItinerary[] = [];

  for (const outbound of outboundLegs) {
    for (const inbound of inboundLegs) {
      const isOpenJaw = outbound.destination_iata !== inbound.origin_iata;
      if (isOpenJaw && !allowOpenJaw) continue;

      let interCityTransfer: LiveItinerary['interCityTransfer'] = null;
      if (isOpenJaw) {
        const rows = (await sql`
          SELECT mode, duration_min, price_eur FROM transfer_times
          WHERE origin_iata = ${outbound.destination_iata} AND destination_iata = ${inbound.origin_iata}
          ORDER BY duration_min ASC LIMIT 1
        `) as { mode: string; duration_min: number; price_eur: string | null }[];
        if (rows[0]) {
          interCityTransfer = {
            mode: rows[0].mode,
            duration_min: rows[0].duration_min,
            price_eur: rows[0].price_eur ? Number(rows[0].price_eur) : null
          };
        }
      }

      const totalPax = pax.adults + pax.children;
      const totalPrice =
        outbound.price_amount + inbound.price_amount + (interCityTransfer?.price_eur ?? 0) * totalPax;

      if (maxPriceTotal !== undefined && totalPrice > maxPriceTotal) continue;

      const transferRow = (await sql`
        SELECT airport_to_center_min FROM hotel_transfer WHERE airport_iata = ${inbound.origin_iata} LIMIT 1
      `) as { airport_to_center_min: number }[];
      const airportTransferMinutes = transferRow[0]?.airport_to_center_min ?? 45;

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
            (interCityTransfer
              ? ` Traslado interno estimado: ${interCityTransfer.duration_min} min en ${interCityTransfer.mode}.`
              : ' Sin dato de traslado interno registrado; verificar manualmente.')
        );
      }
      if (outbound.cabin_baggage_included === null || inbound.cabin_baggage_included === null) {
        notes.push('Ignav no especifica equipaje de mano para esta tarifa; verificar manualmente antes de reservar.');
      } else if (!outbound.cabin_baggage_included || !inbound.cabin_baggage_included) {
        notes.push('Aviso: la tarifa puede no incluir equipaje de mano tipo trolley.');
      }

      results.push({
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

  results.sort((a, b) => {
    if (sortBy === 'price') return a.totalPrice - b.totalPrice;
    if (sortBy === 'duration')
      return a.outbound.duration_min + a.inbound.duration_min - (b.outbound.duration_min + b.inbound.duration_min);
    return new Date(b.hotelCheckoutAt).getTime() - new Date(a.hotelCheckoutAt).getTime();
  });

  return results;
}
