'use client';

import { useEffect, useState } from 'react';
import type { Itinerary } from '@/lib/types';

type Meta = {
  groups: { id: string; name: string; country: string }[];
  origins: { iata: string; city: string }[];
};

export default function HomePage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [originIata, setOriginIata] = useState('ALC');
  const [destinationGroupId, setDestinationGroupId] = useState('poland');
  const [outboundDate, setOutboundDate] = useState('2026-12-04');
  const [inboundDate, setInboundDate] = useState('2026-12-08');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(1);
  const [requireCabinBaggage, setRequireCabinBaggage] = useState(false);
  const [allowOpenJaw, setAllowOpenJaw] = useState(true);
  const [outboundNotBeforeHour, setOutboundNotBeforeHour] = useState<number | ''>('');
  const [inboundNotBeforeHour, setInboundNotBeforeHour] = useState<number | ''>(6);
  const [maxPriceTotal, setMaxPriceTotal] = useState<number | ''>('');
  const [sortBy, setSortBy] = useState<'checkout_time' | 'price' | 'duration'>('checkout_time');
  const [results, setResults] = useState<Itinerary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/meta')
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setError('No se pudo cargar la configuración inicial.'));
  }, []);

  async function handleSearch() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originIata,
          destinationGroupId,
          outboundDate,
          inboundDate,
          pax: { adults, children },
          requireCabinBaggage,
          allowOpenJaw,
          outboundNotBeforeHour: outboundNotBeforeHour === '' ? undefined : Number(outboundNotBeforeHour),
          inboundNotBeforeHour: inboundNotBeforeHour === '' ? undefined : Number(inboundNotBeforeHour),
          maxPriceTotal: maxPriceTotal === '' ? undefined : Number(maxPriceTotal),
          sortBy
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
      setResults(data.itineraries);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl shadow p-6 space-y-4">
        <h2 className="text-lg font-semibold">Filtros de búsqueda</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <label className="text-sm">
            Origen
            <select className="mt-1 w-full border rounded p-2" value={originIata} onChange={(e) => setOriginIata(e.target.value)}>
              {(meta?.origins ?? [{ iata: 'ALC', city: 'Alicante' }]).map((o) => (
                <option key={o.iata} value={o.iata}>{o.city} ({o.iata})</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Destino (grupo)
            <select className="mt-1 w-full border rounded p-2" value={destinationGroupId} onChange={(e) => setDestinationGroupId(e.target.value)}>
              {(meta?.groups ?? [{ id: 'poland', name: 'Polonia', country: 'Polonia' }]).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Fecha ida
            <input type="date" className="mt-1 w-full border rounded p-2" value={outboundDate} onChange={(e) => setOutboundDate(e.target.value)} />
          </label>
          <label className="text-sm">
            Fecha vuelta
            <input type="date" className="mt-1 w-full border rounded p-2" value={inboundDate} onChange={(e) => setInboundDate(e.target.value)} />
          </label>
          <label className="text-sm">
            Adultos
            <input type="number" min={1} className="mt-1 w-full border rounded p-2" value={adults} onChange={(e) => setAdults(Number(e.target.value))} />
          </label>
          <label className="text-sm">
            Niños
            <input type="number" min={0} className="mt-1 w-full border rounded p-2" value={children} onChange={(e) => setChildren(Number(e.target.value))} />
          </label>
          <label className="text-sm">
            Ida no antes de (hora)
            <input type="number" min={0} max={23} className="mt-1 w-full border rounded p-2" value={outboundNotBeforeHour} onChange={(e) => setOutboundNotBeforeHour(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-sm">
            Vuelta no antes de (hora)
            <input type="number" min={0} max={23} className="mt-1 w-full border rounded p-2" value={inboundNotBeforeHour} onChange={(e) => setInboundNotBeforeHour(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-sm">
            Precio máx. total (€)
            <input type="number" min={0} className="mt-1 w-full border rounded p-2" value={maxPriceTotal} onChange={(e) => setMaxPriceTotal(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-sm">
            Ordenar por
            <select className="mt-1 w-full border rounded p-2" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
              <option value="checkout_time">Hora salida hotel (mejor primero)</option>
              <option value="price">Precio total</option>
              <option value="duration">Duración total de vuelo</option>
            </select>
          </label>
          <label className="text-sm flex items-center gap-2 mt-6">
            <input type="checkbox" checked={requireCabinBaggage} onChange={(e) => setRequireCabinBaggage(e.target.checked)} />
            Exigir equipaje de mano incluido
          </label>
          <label className="text-sm flex items-center gap-2 mt-6">
            <input type="checkbox" checked={allowOpenJaw} onChange={(e) => setAllowOpenJaw(e.target.checked)} />
            Permitir open-jaw en destino (entrar/salir por aeropuertos distintos)
          </label>
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="bg-brand-600 hover:bg-brand-500 text-white font-medium px-5 py-2 rounded-lg disabled:opacity-50"
        >
          {loading ? 'Buscando…' : 'Buscar itinerarios'}
        </button>
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </section>

      {results && (
        <section className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Resultados ({results.length})</h2>
          {results.length === 0 && <p className="text-sm text-slate-500">Sin itinerarios directos que cumplan los filtros. Prueba a ampliar el rango horario o desactivar algún filtro.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Ida</th>
                  <th className="p-2">Vuelta</th>
                  <th className="p-2">Open-jaw</th>
                  <th className="p-2">Precio total</th>
                  <th className="p-2">Salida hotel día 8</th>
                  <th className="p-2">Notas</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b align-top">
                    <td className="p-2">
                      {r.outbound.airline} {r.outbound.flight_number}<br />
                      {r.outbound.origin_iata} → {r.outbound.destination_iata}<br />
                      {new Date(r.outbound.departure_at).toLocaleString('es-ES')}
                    </td>
                    <td className="p-2">
                      {r.inbound.airline} {r.inbound.flight_number}<br />
                      {r.inbound.origin_iata} → {r.inbound.destination_iata}<br />
                      {new Date(r.inbound.departure_at).toLocaleString('es-ES')}
                    </td>
                    <td className="p-2">{r.isOpenJaw ? 'Sí' : 'No'}</td>
                    <td className="p-2 font-medium">{r.totalPrice.toFixed(2)} €</td>
                    <td className="p-2">{new Date(r.hotelCheckoutAt).toLocaleString('es-ES')}</td>
                    <td className="p-2 text-slate-600">{r.notes.join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-slate-400">
        Los datos mostrados provienen de la base de datos interna (fixtures de ejemplo mientras no se conecte una API de tarifas en vivo).
        No representan precios reales confirmados hasta que se integre Ignav/FlightAPI.
      </p>
    </div>
  );
}
