export type Pax = {
  adults: number;
  children: number;
};

export type SearchFilters = {
  originIata: string;
  destinationGroupId: string;
  outboundDateFrom: string;
  outboundDateTo: string;
  inboundDateFrom: string;
  inboundDateTo: string;
  pax: Pax;
  requireDirect: boolean;
  requireCabinBaggage: boolean;
  allowOpenJaw: boolean;
  outboundNotBeforeHour?: number;
  inboundNotBeforeHour?: number;
  maxPriceTotal?: number;
  airlinesInclude?: string[];
  airlinesExclude?: string[];
  sortBy: 'checkout_time' | 'price' | 'duration';
};

export type Leg = {
  id: number;
  origin_iata: string;
  destination_iata: string;
  airline: string;
  flight_number: string;
  departure_at: string;
  arrival_at: string;
  duration_min: number;
  is_direct: boolean;
  price_eur: string;
  cabin_baggage_included: boolean;
  checked_baggage_included: boolean;
  cabin_class: string;
};

export type Itinerary = {
  outbound: Leg;
  inbound: Leg;
  isOpenJaw: boolean;
  interCityTransfer?: { mode: string; duration_min: number; price_eur: number | null } | null;
  pricePerPerson: number;
  totalPrice: number;
  hotelCheckoutAt: string;
  airportTransferMinutes: number;
  notes: string[];
};

export function datesBetween(fromIso: string, toIso: string): string[] {
  const from = new Date(fromIso + 'T00:00:00Z');
  const to = new Date(toIso + 'T00:00:00Z');
  const dates: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
