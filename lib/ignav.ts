const IGNAV_BASE_URL = 'https://ignav.com/api/fares';

export type IgnavPrice = { amount: number; currency: string; status: 'verified' | 'unverified' };

export type IgnavSegment = {
  marketing_carrier_code: string | null;
  flight_number: string | null;
  operating_carrier_name: string | null;
  departure_airport: string;
  departure_time_local: string;
  departure_timezone: string | null;
  departure_time_utc: string | null;
  arrival_airport: string;
  arrival_time_local: string;
  arrival_timezone: string | null;
  arrival_time_utc: string | null;
  duration_minutes: number;
  aircraft: string | null;
};

export type IgnavLeg = {
  carrier?: string;
  duration_minutes?: number;
  segments: IgnavSegment[];
};

export type IgnavItinerary = {
  price: IgnavPrice;
  outbound: IgnavLeg;
  inbound?: IgnavLeg;
  cabin_class: string;
  bags?: { carry_on?: number; checked?: number };
  requires_self_transfer: boolean;
  ignav_id: string;
};

export type IgnavOneWayResponse = {
  origin: string;
  destination: string;
  departure_date: string;
  itineraries: IgnavItinerary[];
};

export type TimeRangeFilter = {
  earliest_hour?: number;
  latest_hour?: number;
  arrival_earliest_hour?: number;
  arrival_latest_hour?: number;
};

export type OneWaySearchParams = {
  origin: string;
  destination: string;
  departure_date: string;
  adults?: number;
  children?: number;
  cabin_class?: string;
  max_stops?: number;
  min_carry_on_bags?: number;
  min_checked_bags?: number;
  max_price?: number;
  departure_time_range?: TimeRangeFilter;
  airlines_include?: string[];
  airlines_exclude?: string[];
  allow_self_transfer?: boolean;
  market?: string;
};

function sanitize(raw: string): string {
  return raw.replace(/[\s\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ').trim();
}

function getApiKey(): string {
  const key = process.env.IGNAV_API_KEY;
  if (!key) {
    throw new Error('IGNAV_API_KEY no esta definida. Anadela en Vercel > Project Settings > Environment Variables.');
  }
  return sanitize(key);
}

async function ignavPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${IGNAV_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'X-Api-Key': getApiKey(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ignav API error ${res.status} en ${path}: ${text}`);
  }
  return (await res.json()) as T;
}

export async function searchOneWay(params: OneWaySearchParams): Promise<IgnavOneWayResponse> {
  const cleanParams = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
  return ignavPost<IgnavOneWayResponse>('/one-way', { market: 'ES', ...cleanParams });
}

export type BookingLinksResponse = {
  itinerary: IgnavItinerary;
  booking_options: {
    legs: string[];
    links: {
      provider_name: string;
      provider_type: string;
      fare_name?: string;
      price?: IgnavPrice;
      url: string;
    }[];
  }[];
};

export async function getBookingLinksByIgnavId(ignavId: string): Promise<BookingLinksResponse> {
  return ignavPost<BookingLinksResponse>('/booking-links', { ignav_id: ignavId });
}
