'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LiveItinerary } from '@/lib/live-engine';
import { parseSearchQuery } from '@/lib/nlp-search';
import RouteMap from '@/components/RouteMap';
import ToolsPanel from '@/components/ToolsPanel';
import { IconSliders, IconMapPin } from '@/components/Icons';

const HERO_IMAGE_URL =
  'https://st.perplexity.ai/estatic/0b226c450798410ac541646c86ec31afd840e5beab817a5d84fa821e7db61981ec84c3b4a3f072a7a2e1899c9fb06c6e0313946104e1450d38d221a8f7c3e7422d4ae0f9cf9af1e0268ddda3c60a281353ebfe0b19e27fe6c7fccada88b5b3df0bee15765f0afd9f6426fc8cf44a50ce';

type Meta = {
  groups: { id: string; name: string; country: string }[];
  origins: { iata: string; city: string }[];
};

type RealDestination = {
  dest_iata: string;
  dest_name: string;
  country: string;
  served_from: string[];
  last_synced: string | null;
};

type BookingLinksState = Record<string, { provider_name: string; url: string; price?: { amount: number; currency: string } }[]>;

function toggle(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function sortResults(items: LiveItinerary[], sortBy: 'checkout_time' | 'price' | 'duration'): LiveItinerary[] {
  const copy = [...items];
  copy.sort((a: any, b: any) => {
    if (sortBy === 'price') return a.totalPrice - b.totalPrice;
    if (sortBy === 'duration') {
      const da = new Date(a.inbound.arrival_at).getTime() - new Date(a.outbound.departure_at).getTime();
      const db = new Date(b.inbound.arrival_at).getTime() - new Date(b.outbound.departure_at).getTime();
      return da - db;
    }
    return new Date(a.hotelCheckoutAt).getTime() - new Date(b.hotelCheckoutAt).getTime();
  });
  return copy;
}

export default function HomePage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [travelIdeasMode, setTravelIdeasMode] = useState(false);
  const [originIatas, setOriginIatas] = useState<string[]>(['ALC']);
  const [destinationGroupIds, setDestinationGroupIds] = useState<string[]>([]);
  const [selectedDestIatas, setSelectedDestIatas] = useState<string[]>([]);
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
  const [liveResults, setLiveResults] = useState<LiveItinerary[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingLinks, setBookingLinks] = useState<BookingLinksState>({});
  const [loadingLinks, setLoadingLinks] = useState<string | null>(null);

  const [nlpText, setNlpText] = useState('');
  const [nlpWarnings, setNlpWarnings] = useState<string[]>([]);

  const [realDestinations, setRealDestinations] = useState<RealDestination[]>([]);
  const [realDestError, setRealDestError] = useState<string | null>(null);
  const [realDestFilter, setRealDestFilter] = useState('');
  const [showCuratedGroups, setShowCuratedGroups] = useState(false);

  useEffect(() => {
    fetch('/api/meta')
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setError('No se pudo cargar la configuracion inicial.'));
  }, []);

  useEffect(() => {
    if (originIatas.length === 0) {
      setRealDestinations([]);
      return;
    }
    setRealDestError(null);
    fetch(`/api/destinations?origins=${originIatas.join(',')}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? `Error ${r.status}`);
        return data;
      })
      .then((data) => setRealDestinations(data.destinations ?? []))
      .catch((e) => {
        setRealDestinations([]);
        setRealDestError(e.message);
      });
  }, [originIatas]);

  const combos = originIatas.length * (destinationGroupIds.length + selectedDestIatas.length);

  const filteredRealDestinations = useMemo(() => {
    const q = realDestFilter.trim().toLowerCase();
    if (!q) return realDestinations;
    return realDestinations.filter(
      (d) => d.dest_name.toLowerCase().includes(q) || d.country.toLowerCase().includes(q) || d.dest_iata.toLowerCase().includes(q)
    );
  }, [realDestinations, realDestFilter]);

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

  async function runSearch(groupIdsOverride?: string[], iataOverride?: string[]) {
    setLoading(true);
    setError(null);
    setWarnings([]);
    setBookingLinks({});
    const groupIds = groupIdsOverride ?? destinationGroupIds;
    const iatas = iataOverride ?? selectedDestIatas;
    const payload = {
      originIatas,
      destinationGroupIds: groupIds,
      destinationIatas: iatas,
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
      const res = await fetch('/api/search-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
      if (data.warnings?.length) setWarnings(data.warnings);
      setLiveResults(sortResults(data.itineraries ?? [], sortBy));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    await runSearch();
  }

  async function handleTravelIdeas() {
    const allGroupIds = (meta?.groups ?? []).map((g) => g.id);
    if (originIatas.length * allGroupIds.length > 6) {
      setError(
        '"Quiero viajar" con todos los grupos curados supera el limite de 6 combinaciones origen x destino de Ignav. Reduce los origenes seleccionados o desactiva "Quiero viajar" y elige destinos concretos.'
      );
      return;
    }
    setDestinationGroupIds(allGroupIds);
    setSelectedDestIatas([]);
    await runSearch(allGroupIds, []);
  }

  function handleReSort(newSortBy: 'checkout_time' | 'price' | 'duration') {
    setSortBy(newSortBy);
    if (liveResults) setLiveResults(sortResults(liveResults, newSortBy));
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
  const groupsList = meta?.groups ?? [];

  return (
    <div className="space-y-10">
      <header
        className="relative overflow-hidden rounded-2xl border border-slate-200 shadow-sm px-6 py-16 md:py-24 text-center text-white"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.55), rgba(15,23,42,0.75)), url(${HERO_IMAGE_URL})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
          Encuentra tu vuelo directo
        </h1>
        <p className="mt-4 max-w-lg mx-auto text-sm md:text-base text-white/90 leading-relaxed">
          Ida y vuelta sin escalas desde Alicante, Madrid, Valencia y Murcia. Datos en vivo de Ignav,
          nunca estimaciones.
        </p>
      </header>

      <RouteMap />

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Busqueda en lenguaje natural</h2>
        <p className="text-sm text-slate-500">
          Ej.: "vuelo a Polonia desde Alicante o Valencia, salida el 4 despues de las 18h o si no el 5 a partir de las 8h,
          regreso no antes de las 12h". Revisa siempre como se ha interpretado antes de buscar.
        </p>
        <textarea
          className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
          rows={2}
          value={nlpText}
          onChange={(e) => setNlpText(e.target.value)}
          placeholder="Describe tu busqueda en una frase..."
        />
        <button
          onClick={handleInterpret}
          className="bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Interpretar y precargar filtros
        </button>
        {nlpWarnings.length > 0 && (
          <div className="text-amber-800 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="font-medium mb-1">Revisa la interpretacion:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {nlpWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <IconSliders className="w-5 h-5 text-brand-600" />
            <h2 className="text-base font-semibold text-slate-900">Filtros de busqueda</h2>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={travelIdeasMode} onChange={(e) => setTravelIdeasMode(e.target.checked)} />
            Quiero viajar, propon ideas (grupos curados)
          </label>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">Origenes</p>
          <div className="flex flex-wrap gap-2">
            {originsList.map((o) => (
              <label
                key={o.iata}
                className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${originIatas.includes(o.iata) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-slate-300 text-slate-600 hover:border-brand-300'}`}
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
          <div className="flex items-center gap-2 mb-2">
            <IconMapPin className="w-4 h-4 text-brand-600" />
            <p className="text-sm font-medium text-slate-700">
              Destinos ({filteredRealDestinations.length} vuelos directos reales desde tus origenes)
            </p>
          </div>
          {realDestError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-2">
              No se pudo cargar el listado: {realDestError}
            </p>
          )}
          <input
            type="text"
            placeholder="Filtrar por ciudad, pais o codigo IATA..."
            className="w-full border border-slate-300 rounded-lg p-2 text-sm mb-2"
            value={realDestFilter}
            onChange={(e) => setRealDestFilter(e.target.value)}
          />
          <div className="max-h-64 overflow-y-auto grid grid-cols-2 md:grid-cols-3 gap-1.5 text-xs border border-slate-200 rounded-xl p-2 bg-slate-50">
            {filteredRealDestinations.map((d) => (
              <label
                key={d.dest_iata}
                className={`px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${selectedDestIatas.includes(d.dest_iata) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-slate-200 hover:border-brand-300'}`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={selectedDestIatas.includes(d.dest_iata)}
                  onChange={() => setSelectedDestIatas((prev) => toggle(prev, d.dest_iata))}
                />
                <span className="font-medium">{d.dest_name}</span> ({d.dest_iata})
                <br />
                <span className={selectedDestIatas.includes(d.dest_iata) ? 'text-white/80' : 'text-slate-400'}>
                  {d.country} &middot; desde {d.served_from.join(', ')}
                </span>
              </label>
            ))}
            {filteredRealDestinations.length === 0 && !realDestError && (
              <p className="text-slate-400 col-span-full">Sin resultados o cache aun no sincronizada.</p>
            )}
          </div>
          {selectedDestIatas.length > 0 && (
            <p className="text-xs text-slate-500 mt-2">{selectedDestIatas.length} destino(s) seleccionado(s).</p>
          )}

          <button
            type="button"
            onClick={() => setShowCuratedGroups((v) => !v)}
            className="mt-3 text-xs font-medium text-brand-600 hover:text-brand-500"
          >
            {showCuratedGroups ? 'Ocultar' : 'Ver'} sugerencias con evento o temporada (mercados navidenos, festivales...)
          </button>
          {showCuratedGroups && (
            <div className={`flex flex-wrap gap-2 mt-2 ${travelIdeasMode ? 'opacity-40 pointer-events-none' : ''}`}>
              {groupsList.map((g) => (
                <label
                  key={g.id}
                  className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${destinationGroupIds.includes(g.id) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-slate-300 text-slate-600 hover:border-brand-300'}`}
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
          )}
          {travelIdeasMode && (
            <p className="text-xs text-slate-500 mt-2">
              En modo "Quiero viajar" se buscan todos los grupos curados con evento/temporada; no hace falta elegir uno.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-600">
              Ida desde
              <input type="date" className="mt-1 w-full border border-slate-300 rounded-lg p-2 text-sm" value={outboundDateFrom} onChange={(e) => setOutboundDateFrom(e.target.value)} />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Ida hasta
              <input type="date" className="mt-1 w-full border border-slate-300 rounded-lg p-2 text-sm" value={outboundDateTo} onChange={(e) => setOutboundDateTo(e.target.value)} />
            </label>
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-600">
              Vuelta desde
              <input type="date" className="mt-1 w-full border border-slate-300 rounded-lg p-2 text-sm" value={inboundDateFrom} onChange={(e) => setInboundDateFrom(e.target.value)} />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Vuelta hasta
              <input type="date" className="mt-1 w-full border border-slate-300 rounded-lg p-2 text-sm" value={inboundDateTo} onChange={(e) => setInboundDateTo(e.target.value)} />
            </label>
          </div>
          <label className="text-xs font-medium text-slate-600">
            Adultos
            <input type="number" min={1} className="mt-1 w-full border border-slate-300 rounded-lg p-2 text-sm" value={adults} onChange={(e) => setAdults(Number(e.target.value))} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Ninos
            <input type="number" min={0} className="mt-1 w-full border border-slate-300 rounded-lg p-2 text-sm" value={children} onChange={(e) => setChildren(Number(e.target.value))} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Ida no antes de (h)
            <input
              type="number"
              min={0}
              max={23}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2 text-sm"
              value={outboundNotBeforeHour}
              onChange={(e) => setOutboundNotBeforeHour(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Vuelta no antes de (h)
            <input
              type="number"
              min={0}
              max={23}
              className="mt-1 w-full border border-slate-300 rounded-lg p-2 text-sm"
              value={inboundNotBeforeHour}
              onChange={(e) => setInboundNotBeforeHour(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Precio max. total
            <input type="number" min={0} className="mt-1 w-full border border-slate-300 rounded-lg p-2 text-sm" value={maxPriceTotal} onChange={(e) => setMaxPriceTotal(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Ordenar por
            <select className="mt-1 w-full border border-slate-300 rounded-lg p-2 text-sm" value={sortBy} onChange={(e) => handleReSort(e.target.value as any)}>
              <option value="checkout_time">Hora salida hotel</option>
              <option value="price">Precio total</option>
              <option value="duration">Duracion total</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600 flex items-center gap-2 mt-5">
            <input type="checkbox" checked={requireCabinBaggage} onChange={(e) => setRequireCabinBaggage(e.target.checked)} />
            Exigir equipaje de mano
          </label>
          <label className="text-xs font-medium text-slate-600 flex items-center gap-2 mt-5">
            <input type="checkbox" checked={allowOpenJaw} onChange={(e) => setAllowOpenJaw(e.target.checked)} />
            Permitir open-jaw en destino
          </label>
        </div>

        {!travelIdeasMode && (
          <p className="text-xs text-slate-500">
            Combinaciones origen x destino: <strong>{combos}</strong>
            {combos > 6 && <span className="text-red-600"> (maximo 6; reduce la seleccion)</span>}
          </p>
        )}
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Maximo 5 dias por tramo y 6 combinaciones origen x destino, para no agotar la cuota gratuita de Ignav.
        </p>

        <button
          onClick={travelIdeasMode ? handleTravelIdeas : handleSearch}
          disabled={loading || originIatas.length === 0 || (!travelIdeasMode && destinationGroupIds.length === 0 && selectedDestIatas.length === 0)}
          className="bg-brand-600 hover:bg-brand-500 text-white font-medium px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? 'Buscando...' : travelIdeasMode ? 'Proponme ideas de viaje' : 'Buscar vuelos'}
        </button>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {warnings.length > 0 && (
          <div className="text-amber-800 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="font-medium mb-1">Avisos de la busqueda:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <ToolsPanel
        originIatas={originIatas}
        destinationGroupIds={destinationGroupIds}
        destinationIatas={selectedDestIatas}
        outboundDateFrom={outboundDateFrom}
        outboundDateTo={outboundDateTo}
        inboundDateFrom={inboundDateFrom}
        inboundDateTo={inboundDateTo}
        adults={adults}
        children={children}
        maxPriceTotal={maxPriceTotal}
      />

      {liveResults && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900">Resultados ({liveResults.length})</h2>
            <select className="border border-slate-300 rounded-lg p-1.5 text-xs" value={sortBy} onChange={(e) => handleReSort(e.target.value as any)}>
              <option value="checkout_time">Hora salida hotel</option>
              <option value="price">Precio total</option>
              <option value="duration">Duracion total</option>
            </select>
          </div>
          {liveResults.length === 0 && <p className="text-sm text-slate-500">Sin itinerarios directos que cumplan los filtros. Revisa los avisos de arriba.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-200 text-slate-500">
                  <th className="p-2 font-medium">Ruta</th>
                  <th className="p-2 font-medium">Ida</th>
                  <th className="p-2 font-medium">Vuelta</th>
                  <th className="p-2 font-medium">Open-jaw</th>
                  <th className="p-2 font-medium">Precio</th>
                  <th className="p-2 font-medium">Salida hotel</th>
                  <th className="p-2 font-medium">Notas</th>
                  <th className="p-2 font-medium">Reserva</th>
                </tr>
              </thead>
              <tbody>
                {liveResults.map((r, i) => {
                  const rowKey = `${r.outbound.ignav_id}-${r.inbound.ignav_id}`;
                  return (
                    <tr key={rowKey} className="border-b border-slate-100 align-top">
                      <td className="p-2 font-medium text-slate-800">
                        {r.originIata} to {r.destinationGroupName}
                        {r.isSingleIataTarget && <span className="ml-1 text-[10px] text-slate-400">(destino suelto)</span>}
                      </td>
                      <td className="p-2">{r.outbound.airline} {r.outbound.flight_number}<br />{r.outbound.origin_iata} to {r.outbound.destination_iata}<br />{new Date(r.outbound.departure_at).toLocaleString('es-ES')}</td>
                      <td className="p-2">{r.inbound.airline} {r.inbound.flight_number}<br />{r.inbound.origin_iata} to {r.inbound.destination_iata}<br />{new Date(r.inbound.departure_at).toLocaleString('es-ES')}</td>
                      <td className="p-2">{r.isOpenJaw ? 'Si' : 'No'}</td>
                      <td className="p-2 font-medium text-slate-800">{r.totalPrice.toFixed(2)} {r.currency}</td>
                      <td className="p-2">{new Date(r.hotelCheckoutAt).toLocaleString('es-ES')}</td>
                      <td className="p-2 text-slate-500">{r.notes.join(' ')}</td>
                      <td className="p-2">
                        <button
                          className="text-brand-600 hover:text-brand-500 underline text-xs"
                          onClick={() => handleShowLinks(rowKey, r.outbound.ignav_id)}
                          disabled={loadingLinks === rowKey}
                        >
                          {loadingLinks === rowKey ? 'Cargando...' : 'Ver enlaces ida'}
                        </button>
                        {bookingLinks[rowKey] && (
                          <ul className="mt-1 space-y-1">
                            {bookingLinks[rowKey].map((link, j) => (
                              <li key={j}>
                                <a href={link.url} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:text-brand-500 underline">
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

      <p className="text-xs text-slate-400 text-center">
        Datos en vivo de la API de Ignav. Cada dia adicional y cada combinacion origen x destino consume peticiones de
        la cuota gratuita. Los destinos reales se sincronizan a diario contra los datos publicos de Aena.
      </p>
    </div>
  );
}
