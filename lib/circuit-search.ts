import { searchOneWay } from './ignav';
import { logPriceObservation } from './price-history';
import type { Pax } from './types';

export type CircuitLegInput = { fromIata: string; toIata: string; date: string };

export type CircuitLegResult = {
  fromIata: string;
  toIata: string;
  date: string;
  found: boolean;
  price: number | null;
  currency: string | null;
  airline: string | null;
  departureAt: string | null;
  arrivalAt: string | null;
  ignavId: string | null;
  error?: string;
};

export type CircuitSearchResult = { legs: CircuitLegResult[]; totalPrice: number | null; currency: string | null };

// Limite duro de tramos por circuito: cada tramo gasta 1 peticion real a Ignav (no hay
// rango de fechas por tramo, solo un dia concreto), asi que el coste maximo de un
// circuito completo es predecible y acotado.
export const MAX_CIRCUIT_LEGS = 5;

export async function searchCircuit(legs: CircuitLegInput[], pax: Pax): Promise<CircuitSearchResult> {
  if (legs.length === 0) throw new Error('El circuito no tiene ningun tramo.');
  if (legs.length > MAX_CIRCUIT_LEGS) {
    throw new Error(
      `Un circuito admite como maximo ${MAX_CIRCUIT_LEGS} tramos ahora mismo, para proteger tu cuota de Ignav (cada tramo gasta 1 peticion real, sin rango de fechas).`
    );
  }

  const results = await Promise.all(
    legs.map(async (leg): Promise<CircuitLegResult> => {
      const base = { fromIata: leg.fromIata, toIata: leg.toIata, date: leg.date };
      try {
        const res = await searchOneWay({
          origin: leg.fromIata,
          destination: leg.toIata,
          departure_date: leg.date,
          adults: pax.adults,
          children: pax.children,
          max_stops: 0
        });
        if (!res.itineraries.length) {
          return { ...base, found: false, price: null, currency: null, airline: null, departureAt: null, arrivalAt: null, ignavId: null };
        }
        const cheapest = [...res.itineraries].sort((a, b) => a.price.amount - b.price.amount)[0];
        const segments = cheapest.outbound.segments;
        const first = segments[0];
        const last = segments[segments.length - 1];
        if (first) {
          void logPriceObservation(leg.fromIata, leg.toIata, leg.date, cheapest.price.amount, cheapest.price.currency);
        }
        return {
          ...base,
          found: true,
          price: cheapest.price.amount,
          currency: cheapest.price.currency,
          airline: first?.operating_carrier_name ?? first?.marketing_carrier_code ?? null,
          departureAt: first?.departure_time_utc ?? first?.departure_time_local ?? null,
          arrivalAt: last?.arrival_time_utc ?? last?.arrival_time_local ?? null,
          ignavId: cheapest.ignav_id
        };
      } catch (err) {
        return {
          ...base,
          found: false,
          price: null,
          currency: null,
          airline: null,
          departureAt: null,
          arrivalAt: null,
          ignavId: null,
          error: err instanceof Error ? err.message : 'Error desconocido consultando este tramo'
        };
      }
    })
  );

  const allFound = results.every((r) => r.found && r.price !== null);
  const totalPrice = allFound ? results.reduce((sum, r) => sum + (r.price ?? 0), 0) : null;
  const currency = results.find((r) => r.currency)?.currency ?? null;

  return { legs: results, totalPrice, currency };
}
