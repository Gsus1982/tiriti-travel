'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Itinerary } from '@/lib/types';
import type { LiveItinerary } from '@/lib/live-engine';
import { parseSearchQuery } from '@/lib/nlp-search';

type Meta = {
  groups: { id: string; name: string; country: string }[];
  origins: { iata: string; city: string }[];
};

type BookingLinksState = Record<string, { provider_name: string; url: string; price?: { amount: number; currency: string } }[]>;

function toggle(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export default function HomePage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [mode, setMode] = useState<'mock' | 'live'>('mock');
  const [originIatas, setOriginIatas] = useState<string[]>(['ALC']);
  const [destinationGroupIds, setDestinationGroupIds] = useState<string[]>(['poland']);
  const [outboundDateFrom, setOutboundDateFrom] = useState('2026-12-04');
  const [outboundDateTo, setOutboundDateTo] = useState('2026-12-05');
  const [inboundDateFrom, setInboundDateFrom] = useState('2026-12-08');
  const [inboundDateTo, setInboundDateTo] = useState('2026-12-08');
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
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingLinks, setBookingLinks] = useState<BookingLinksState>({});
  const [loadingLinks, setLoadingLinks] = useState<string | null>(null);

  const [nlpText, setNlpText] = useState('');
  const [nlpWarnings, setNlpWarnings] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/meta')
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setError('No se pudo cargar la configuracion inicial.'));
  }, []);

  const combos = originIatas.length * destinationGroupIds.length;

  function handleInterpret() {
    if (!meta || !nlpText.trim()) return;
    const refDate = new Date(outboundDateFrom || Date.now());
    const parsed = parseSearchQuery(nlpText, meta, { year: refDate.getFullYear(), month: refDate.getMonth() + 1 });

    if (parsed.originIatas.length) setOriginIatas(parsed.originIatas);
    if (parsed.destinationGroupIds.length) setDestinationGroupIds(parsed.destinationGroupIds);
    if (parsed.outboundDateFrom) setOutboundDateFrom(parsed.outboundDateFrom);
    if (parsed.outboundDateTo) setOutboundDateTo(parsed.outboundDateTo);
    if (parsed.inboundDateFrom) setInboundDateFrom(parsed.inboundDateFrom);
    if (parsed.inboundDateTo) setInboundDateTo(parsed.inboundDateTo);
    if (parsed.outboundNotBeforeHour !== undefined) setOutboundNotBeforeHour(parsed.outboundNotBeforeHour);
    if (parsed.inboundNotBeforeHour !== undefined) setInboundNotBeforeHour(parsed.inboundNotBeforeHour);
    setNlpWarnings(parsed.warnings);
  }

  async function handleSearch() {
    setLoading(true);
    setError(null);
    setWarnings([]);
    setBookingLinks({});
    const payload = {
      originIatas,
      destinationGroupIds,
      outboundDateFrom,
      outboundDateTo,
      inboundDateFrom,
      inboundDateTo,
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
      if (data.warnings?.length) setWarnings(data.warnings);
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

  const originsList = meta?.origins ?? [{ iata: 'ALC', city: 'Alicante' }];
  const groupsList = meta?.groups ?? [{ id: 'poland', name: 'Polonia', country: 'Polonia' }];

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl shadow p-6 space-y-3">
        <h2 className="text-lg font-semibold">Busqueda en lenguaje natural (beta)</h2>
        <p className="text-xs text-slate-500">
          Escribe algo como: "vuelo a Polonia desde Alicante o Valencia, salida el 4 despues de las 18h o si no el 5 a partir de las 8h, regreso no antes de las 12h".
          El sistema precargara los filtros; siempre revisa el resultado antes de buscar.
        </p>
        <textarea
          className="w-full border rounded p-2 text-sm"
          rows={2}
          value={nlpText}
          onChange={(e) => setNlpText(e.target.value)}
          placeholder="Describe tu busqueda en una frase..."
        />
        <button
          onClick={handleInterpret}
          className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
        >
          Interpretar y precargar filtros
        </button>
        {nlpWarnings.length > 0 && (
          <div className="text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded p-2">
            <p className="font-medium mb-1">Como se ha interpretado (revisa antes de buscar):</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {nlpWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium mb-1">Origenes (elige uno o varios)</p>
            <div className="flex flex-wrap gap-2">
              {originsList.map((o) => (
                <label
                  key={o.iata}
                  className={`text-xs px-2 py-1 rounded border cursor-pointer ${originIatas.includes(o.iata) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-slate-300'}`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={originIatas.includes(o.iata)}
                    onChange={() => setOriginIatas((prev) => toggle(prev, o.iata))}
                  />
                  {o.city} ({o.iata})
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-1">Destinos (elige uno o varios)</p>
            <div className="flex flex-wrap gap-2">
              {groupsList.map((g) => (
                <label
                  key={g.id}
                  className={`text-xs px-2 py-1 rounded border cursor-pointer ${destinationGroupIds.includes(g.id) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-slate-300'}`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={destinationGroupIds.includes(g.id)}
                    onChange={() => setDestinationGroupIds((prev) => toggle(prev, g.id))}
                  />
                  {g.name}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="col-span-2 grid grid-cols-2 gap-2">
            <label className="text-sm">
              Ida desde
              <input type="date" className="mt-1 w-full border rounded p-2" value={outboundDateFrom} onChange={(e) => setOutboundDateFrom(e.target.value)} />
            </label>
            <label className="text-sm">
              Ida hasta
              <input type="date" className="mt-1 w-full border rounded p-2" value={outboundDateTo} onChange={(e) => setOutboundDateTo(e.target.value)} />
            </label>
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-2">
            <label className="text-sm">
              Vuelta desde
              <input type="date" className="mt-1 w-full border rounded p-2" value={inboundDateFrom} onChange={(e) => setInboundDateFrom(e.target.value)} />
            </label>
            <label className="text-sm">
              Vuelta hasta
              <input type="date" className="mt-1 w-full border rounded p-2" value={inboundDateTo} onChange={(e) => setInboundDateTo(e.target.value)} />
            </label>
          </div>
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
            <input
              type="number"
              min={0}
              max={23}
              className="mt-1 w-full border rounded p-2"
              value={outboundNotBeforeHour}
              onChange={(e) => setOutboundNotBeforeHour(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            Vuelta no antes de (hora)
            <input
              type="number"
              min={0}
              max={23}
              className="mt-1 w-full border rounded p-2"
              value={inboundNotBeforeHour}
              onChange={(e) => setInboundNotBeforeHour(e.target.value === '' ? '' : Number(e.target.value))}
            />
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

        <p className="text-xs text-slate-500">
          Combinaciones origen x destino seleccionadas: <strong>{combos}</strong>
          {mode === 'live' && combos > 6 && <span className="text-red-600"> (maximo 6 en modo Ignav; reduce la seleccion)</span>}
        </p>
        {mode === 'live' && (
          <p className="text-xs text-amber-600">
            En modo Ignav, el rango maximo por tramo (ida o vuelta) es de 5 dias y el maximo de combinaciones origen x destino es 6, para no agotar la cuota gratuita.
          </p>
        )}

        <button
          onClick={handleSearch}
          disabled={loading || originIatas.length === 0 || destinationGroupIds.length === 0}
          className="bg-brand-600 hover:bg-brand-500 text-white font-medium px-5 py-2 rounded-lg disabled:opacity-50"
        >
          {loading ? 'Buscando...' : mode === 'live' ? 'Buscar en vivo (Ignav)' : 'Buscar (datos de ejemplo)'}
        </button>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {warnings.length > 0 && (
          <div className="text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded p-3">
            <p className="font-medium mb-1">Avisos de la busqueda:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
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
                  <th className="p-2">Salida hotel</th>
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
          {liveResults.length === 0 && <p className="text-sm text-slate-500">Sin itinerarios directos que cumplan los filtros para estas fechas. Revisa los avisos de arriba para saber el motivo exacto.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Ruta</th>
                  <th className="p-2">Ida</th>
                  <th className="p-2">Vuelta</th>
                  <th className="p-2">Open-jaw</th>
                  <th className="p-2">Precio total</th>
                  <th className="p-2">Salida hotel</th>
                  <th className="p-2">Notas</th>
                  <th className="p-2">Reserva</th>
                </tr>
              </thead>
              <tbody>
                {liveResults.map((r, i) => {
                  const rowKey = `${r.outbound.ignav_id}-${r.inbound.ignav_id}`;
                  return (
                    <tr key={rowKey} className="border-b align-top">
                      <td className="p-2 font-medium">{r.originIata} to {r.destinationGroupName}</td>
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
        Modo "Datos en vivo (Ignav)": llama a la API de Ignav en tiempo real; cada dia adicional en el rango de fechas y cada combinacion origen x destino multiplica el numero de peticiones consumidas.
      </p>
    </div>
  );
}
