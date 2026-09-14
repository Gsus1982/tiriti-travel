import { sql } from './db';
import type { Itinerary, Leg, SearchFilters } from './types';

const AIRPORT_TO_AIRPORT_BUFFER_MIN = 120;

function hourOf(iso: string): number {
  return new Date(iso).getHours();
}

function addMinutes(iso: string, minutes: number): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - minutes);
  return d.toISOString();
}

type SharedParams = Omit<SearchFilters, 'originIatas' | 'destinationGroupIds'>;

async function searchForPair(originIata: string, destinationGroupId: string, shared: SharedParams): Promise<Itinerary[]> {
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
  } = shared;

  const groupAirports = (await sql`
    SELECT iata, city FROM airports WHERE group_id = ${destinationGroupId}
  `) as { iata: string; city: string }[];
  const groupIatas = groupAirports.map((a) => a.iata);
  if (groupIatas.length === 0) return [];

  const outboundLegs = (await sql`
    SELECT * FROM legs
    WHERE origin_iata = ${originIata}
      AND destination_iata = ANY(${groupIatas})
      AND departure_at::date BETWEEN ${outboundDateFrom}::date AND ${outboundDateTo}::date
      AND is_direct = TRUE
  `) as Leg[];

  const inboundLegs = (await sql`
    SELECT * FROM legs
    WHERE destination_iata = ${originIata}
      AND origin_iata = ANY(${groupIatas})
      AND departure_at::date BETWEEN ${inboundDateFrom}::date AND ${inboundDateTo}::date
      AND is_direct = TRUE
  `) as Leg[];

  const cityByIata = new Map(groupAirports.map((a) => [a.iata, a.city]));
  const results: Itinerary[] = [];

  for (const outbound of outboundLegs) {
    if (outboundNotBeforeHour !== undefined && hourOf(outbound.departure_at) < outboundNotBeforeHour) continue;
    if (airlinesInclude?.length && !airlinesInclude.includes(outbound.airline)) continue;
    if (airlinesExclude?.length && airlinesExclude.includes(outbound.airline)) continue;
    if (requireCabinBaggage && !outbound.cabin_baggage_included) continue;

    for (const inbound of inboundLegs) {
      if (inboundNotBeforeHour !== undefined && hourOf(inbound.departure_at) < inboundNotBeforeHour) continue;
      if (airlinesInclude?.length && !airlinesInclude.includes(inbound.airline)) continue;
      if (airlinesExclude?.length && airlinesExclude.includes(inbound.airline)) continue;
      if (requireCabinBaggage && !inbound.cabin_baggage_included) continue;
      if (new Date(inbound.departure_at) <= new Date(outbound.departure_at)) continue;

      const isOpenJaw = outbound.destination_iata !== inbound.origin_iata;
      if (isOpenJaw && !allowOpenJaw) continue;

      let interCityTransfer: Itinerary['interCityTransfer'] = null;
      if (isOpenJaw) {
        const transferRows = (await sql`
          SELECT mode, duration_min, price_eur FROM transfer_times
          WHERE origin_iata = ${outbound.destination_iata} AND destination_iata = ${inbound.origin_iata}
          ORDER BY duration_min ASC LIMIT 1
        `) as { mode: string; duration_min: number; price_eur: string | null }[];
        if (transferRows[0]) {
          interCityTransfer = {
            mode: transferRows[0].mode,
            duration_min: transferRows[0].duration_min,
            price_eur: transferRows[0].price_eur ? Number(transferRows[0].price_eur) : null
          };
        }
      }

      const totalPax = pax.adults + pax.children;
      const pricePerPerson = Number(outbound.price_eur) + Number(inbound.price_eur);
      const totalPrice = pricePerPerson * totalPax + (interCityTransfer?.price_eur ?? 0) * totalPax;
      if (maxPriceTotal !== undefined && totalPrice > maxPriceTotal) continue;

      const transferRow = (await sql`
        SELECT airport_to_center_min FROM hotel_transfer WHERE airport_iata = ${inbound.origin_iata} LIMIT 1
      `) as { airport_to_center_min: number }[];
      const airportTransferMinutes = transferRow[0]?.airport_to_center_min ?? 45;
      const hotelCheckoutAt = addMinutes(inbound.departure_at, AIRPORT_TO_AIRPORT_BUFFER_MIN + airportTransferMinutes);

      const notes: string[] = [];
      if (isOpenJaw) {
        const fromCity = cityByIata.get(outbound.destination_iata) ?? outbound.destination_iata;
        const toCity = cityByIata.get(inbound.origin_iata) ?? inbound.origin_iata;
        notes.push(
          `Open-jaw: llegas a ${fromCity} y sales desde ${toCity}.` +
            (interCityTransfer ? ` Traslado interno estimado: ${interCityTransfer.duration_min} min en ${interCityTransfer.mode}.` : ' Sin dato de traslado interno registrado; verificar manualmente.')
        );
      }
      if (!outbound.cabin_baggage_included || !inbound.cabin_baggage_included) {
        notes.push('Aviso: la tarifa seleccionada puede no incluir equipaje de mano tipo trolley; revisar antes de reservar.');
      }

      results.push({
        outbound,
        inbound,
        isOpenJaw,
        interCityTransfer,
        pricePerPerson,
        totalPrice,
        hotelCheckoutAt,
        airportTransferMinutes,
        notes
      });
    }
  }

  return results;
}

export async function searchItineraries(filters: SearchFilters): Promise<Itinerary[]> {
  const { originIatas, destinationGroupIds, sortBy, ...shared } = filters;

  const allResults = await Promise.all(
    originIatas.flatMap((originIata) => destinationGroupIds.map((groupId) => searchForPair(originIata, groupId, shared)))
  );

  const merged = allResults.flat();

  merged.sort((a, b) => {
    if (sortBy === 'price') return a.totalPrice - b.totalPrice;
    if (sortBy === 'duration') return a.outbound.duration_min + a.inbound.duration_min - (b.outbound.duration_min + b.inbound.duration_min);
    return new Date(b.hotelCheckoutAt).getTime() - new Date(a.hotelCheckoutAt).getTime();
  });

  return merged;
}

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
