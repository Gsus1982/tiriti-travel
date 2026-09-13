export type Pax = {
  adults: number;
  children: number;
};

export type SearchFilters = {
  originIata: string;
  destinationGroupId: string;
  outboundDate: string; // YYYY-MM-DD
  inboundDate: string; // YYYY-MM-DD
  pax: Pax;
  requireDirect: boolean; // siempre true, no negociable
  requireCabinBaggage: boolean;
  allowOpenJaw: boolean; // permitir entrar por un aeropuerto y salir por otro del mismo grupo/país
  outboundNotBeforeHour?: number; // ej. 18 para "a partir de las 18:00"
  inboundNotBeforeHour?: number; // ej. 6 para "no antes de las 06:00"
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
  hotelCheckoutAt: string; // hora exacta de salida del hotel el día de vuelta
  airportTransferMinutes: number;
  notes: string[];
};
