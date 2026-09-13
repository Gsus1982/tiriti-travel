'use client';

import { useEffect, useState } from 'react';
import type { Itinerary } from '@/lib/types';
import type { LiveItinerary } from '@/lib/live-engine';

type Meta = {
  groups: { id: string; name: string; country: string }[];
  origins: { iata: string; city: string }[];
};

type BookingLinksState = Record<string, { provider_name: string; url: string; price?: { amount: number; currency: string } }[]>;

export default function HomePage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [mode, setMode] = useState<'mock' | 'live'>('mock');
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
  const [mockResults, setMockResults] = useState<Itinerary[] | null>(null);
  const [liveResults, setLiveResults] = useState<LiveItinerary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingLinks, setBookingLinks] = useState<BookingLinksState>({});
  const [loadingLinks, setLoadingLinks] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/meta')
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setError('No se pudo cargar la configuracion inicial.'));
  }, []);

  async function handleSearch() {
    setLoading(true);
    setError(null);
    setBookingLinks({});
    const payload = {
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
    };
    try {
      const endpoint = mode === 'live' ? '/api/search-live' : '/api/search';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
      if (mode === 'live') {
        setLiveResults(data.itineraries);
        setMockResults(null);
      } else {
        setMockResults(data.itineraries);
        setLiveResults(null);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleShowLinks(rowKey: string, ignavId: string) {
    setLoadingLinks(rowKey);
    try {
      const res = await fetch('/api/booking-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ignavId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error obteniendo enlaces');
      const links = (data.booking_options ?? []).flatMap((o: any) => o.links ?? []);
      setBookingLinks((prev) => ({ ...prev, [rowKey]: links }));
    } catch (e: any) {
      setBookingLinks((prev) => ({ ...prev, [rowKey]: [] }));
      setError(e.message);
    } finally {
      setLoadingLinks(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl shadow p-6 space-y-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Filtros de busqueda</h2>
          <div className="flex gap-2 text-sm">
            <button
              onClick={() => setMode('mock')}
              className={`px-3 py-1 rounded-full border ${mode === 'mock' ? 'bg-brand-600 text-white' : 'bg-white text-slate-700'}`}
            >
              Datos de ejemplo (mock)
            </button>
            <button
              onClick={() => setMode('live')}
              className={`px-3 py-1 rounded-full border ${mode === 'live' ? 'bg-brand-600 text-white' : 'bg-white text-slate-700'}`}
            >
              Datos en vivo (Ignav)
            </button>
          </div>
        </div>
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
            Ninos
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
            Precio max. total
            <input type="number" min={0} className="mt-1 w-full border rounded p-2" value={maxPriceTotal} onChange={(e) => setMaxPriceTotal(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-sm">
            Ordenar por
            <select className="mt-1 w-full border rounded p-2" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
              <option value="checkout_time">Hora salida hotel (mejor primero)</option>
              <option value="price">Precio total</option>
              <option value="duration">Duracion total de vuelo</option>
            </select>
          </label>
          <label className="text-sm flex items-center gap-2 mt-6">
            <input type="checkbox" checked={requireCabinBaggage} onChange={(e) => setRequireCabinBaggage(e.target.checked)} />
            Exigir equipaje de mano incluido
          </label>
          <label className="text-sm flex items-center gap-2 mt-6">
            <input type="checkbox" checked={allowOpenJaw} onChange={(e) => setAllowOpenJaw(e.target.checked)} />
            Permitir open-jaw en destino
          </label>
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="bg-brand-600 hover:bg-brand-500 text-white font-medium px-5 py-2 rounded-lg disabled:opacity-50"
        >
          {loading ? 'Buscando...' : mode === 'live' ? 'Buscar en vivo (Ignav)' : 'Buscar (datos de ejemplo)'}
        </button>
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </section>

      {mockResults && (
        <section className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Resultados de ejemplo ({mockResults.length})</h2>
          {mockResults.length === 0 && <p className="text-sm text-slate-500">Sin itinerarios directos que cumplan los filtros.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Ida</th>
                  <th className="p-2">Vuelta</th>
                  <th className="p-2">Open-jaw</th>
                  <th className="p-2">Precio total</th>
                  <th className="p-2">Salida hotel dia 8</th>
                  <th className="p-2">Notas</th>
                </tr>
              </thead>
              <tbody>
                {mockResults.map((r, i) => (
                  <tr key={i} className="border-b align-top">
                    <td className="p-2">{r.outbound.airline} {r.outbound.flight_number}<br />{r.outbound.origin_iata} to {r.outbound.destination_iata}<br />{new Date(r.outbound.departure_at).toLocaleString('es-ES')}</td>
                    <td className="p-2">{r.inbound.airline} {r.inbound.flight_number}<br />{r.inbound.origin_iata} to {r.inbound.destination_iata}<br />{new Date(r.inbound.departure_at).toLocaleString('es-ES')}</td>
                    <td className="p-2">{r.isOpenJaw ? 'Si' : 'No'}</td>
                    <td className="p-2 font-medium">{r.totalPrice.toFixed(2)} EUR</td>
                    <td className="p-2">{new Date(r.hotelCheckoutAt).toLocaleString('es-ES')}</td>
                    <td className="p-2 text-slate-600">{r.notes.join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {liveResults && (
        <section className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Resultados en vivo - Ignav ({liveResults.length})</h2>
          {liveResults.length === 0 && <p className="text-sm text-slate-500">Sin itinerarios directos que cumplan los filtros para estas fechas.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Ida</th>
                  <th className="p-2">Vuelta</th>
                  <th className="p-2">Open-jaw</th>
                  <th className="p-2">Precio total</th>
                  <th className="p-2">Salida hotel dia vuelta</th>
                  <th className="p-2">Notas</th>
                  <th className="p-2">Reserva</th>
                </tr>
              </thead>
              <tbody>
                {liveResults.map((r, i) => {
                  const rowKey = `${r.outbound.ignav_id}-${r.inbound.ignav_id}`;
                  return (
                    <tr key={rowKey} className="border-b align-top">
                      <td className="p-2">{r.outbound.airline} {r.outbound.flight_number}<br />{r.outbound.origin_iata} to {r.outbound.destination_iata}<br />{new Date(r.outbound.departure_at).toLocaleString('es-ES')}</td>
                      <td className="p-2">{r.inbound.airline} {r.inbound.flight_number}<br />{r.inbound.origin_iata} to {r.inbound.destination_iata}<br />{new Date(r.inbound.departure_at).toLocaleString('es-ES')}</td>
                      <td className="p-2">{r.isOpenJaw ? 'Si' : 'No'}</td>
                      <td className="p-2 font-medium">{r.totalPrice.toFixed(2)} {r.currency}</td>
                      <td className="p-2">{new Date(r.hotelCheckoutAt).toLocaleString('es-ES')}</td>
                      <td className="p-2 text-slate-600">{r.notes.join(' ')}</td>
                      <td className="p-2">
                        <button
                          className="text-brand-600 underline text-xs"
                          onClick={() => handleShowLinks(rowKey, r.outbound.ignav_id)}
                          disabled={loadingLinks === rowKey}
                        >
                          {loadingLinks === rowKey ? 'Cargando...' : 'Ver enlaces ida'}
                        </button>
                        {bookingLinks[rowKey] && (
                          <ul className="mt-1 space-y-1">
                            {bookingLinks[rowKey].map((link, j) => (
                              <li key={j}>
                                <a href={link.url} target="_blank" rel="noreferrer" className="text-xs text-brand-600 underline">
                                  {link.provider_name} {link.price ? `(${link.price.amount} ${link.price.currency})` : ''}
                                </a>
                              </li>
                            ))}
                            {bookingLinks[rowKey].length === 0 && <li className="text-xs text-slate-400">Sin enlaces disponibles</li>}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-slate-400">
        Modo "Datos de ejemplo": fixtures internos, no representan precios reales.<br />
        Modo "Datos en vivo (Ignav)": llama a la API de Ignav en tiempo real; cada busqueda consume varias peticiones de tu cuota gratuita (una por cada combinacion origen-aeropuerto de destino, en ida y vuelta).
      </p>
    </div>
  );
}
