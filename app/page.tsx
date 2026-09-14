'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LiveItinerary } from '@/lib/live-engine';
import { parseSearchQuery } from '@/lib/nlp-search';
import RouteMap from '@/components/RouteMap';
import ToolsPanel from '@/components/ToolsPanel';
import { IconSliders, IconMapPin } from '@/components/Icons';

const HERO_IMAGE_URL =
  'https://images.pexels.com/photos/35138044/pexels-photo-35138044.jpeg?auto=compress&cs=tinysrgb&w=1920';

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

type BookingLinksState = Record<
  string,
  { provider_name: string; url: string; price?: { amount: number; currency: string } }[]
>;

function toggle(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function toggleAll(prev: string[], values: string[]): string[] {
  const allSelected = values.every((v) => prev.includes(v));
  if (allSelected) return prev.filter((v) => !values.includes(v));
  return Array.from(new Set([...prev, ...values]));
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

function groupByCity(list: RealDestination[]) {
  const map = new Map<string, RealDestination[]>();
  for (const d of list) {
    const base = d.dest_name.split('/')[0].trim();
    if (!map.has(base)) map.set(base, []);
    map.get(base)!.push(d);
  }
  return map;
}

export default function HomePage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [travelIdeasMode, setTravelIdeasMode] = useState(false);
  const [originIatas, setOriginIatas] = useState<string[]>(['ALC']);
  const [destinationGroupIds, setDestinationGroupIds] = useState<string[]>([]);
  const [selectedDestIatas, setSelectedDestIatas] = useState<string[]>([]);
  const [excludeIatasText, setExcludeIatasText] = useState('');
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

  const excludeIatas = useMemo(
    () =>
      excludeIatasText
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    [excludeIatasText]
  );

  const filteredRealDestinations = useMemo(() => {
    const q = realDestFilter.trim().toLowerCase();
    const base = excludeIatas.length
      ? realDestinations.filter((d) => !excludeIatas.includes(d.dest_iata))
      : realDestinations;
    if (!q) return base;
    return base.filter(
      (d) => d.dest_name.toLowerCase().includes(q) || d.country.toLowerCase().includes(q) || d.dest_iata.toLowerCase().includes(q)
    );
  }, [realDestinations, realDestFilter, excludeIatas]);

  const cityGroups = useMemo(() => groupByCity(filteredRealDestinations), [filteredRealDestinations]);

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
      excludeIatas,
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

  return (
    <div className="space-y-10 bg-[#0a0c10] -m-6 p-6 min-h-screen">
      <header
        className="relative overflow-hidden rounded-3xl border border-[#c9a24a]/20 shadow-2xl px-6 py-20 md:py-28 text-center"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(6,8,12,0.75), rgba(6,8,12,0.92)), url(${HERO_IMAGE_URL})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <p className="uppercase tracking-[0.35em] text-xs text-[#c9a24a] font-medium mb-4">Tiriti Travel</p>
        <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-white">
          Vuelos directos, <span className="text-[#c9a24a]">sin escalas.</span>
        </h1>
        <p className="mt-5 max-w-xl mx-auto text-sm md:text-base text-white/70 leading-relaxed">
          Ida y vuelta sin escalas desde Alicante, Madrid, Valencia y Murcia. Datos en vivo de Ignav,
          nunca estimaciones.
        </p>
        <div className="mt-8 flex justify-center gap-6 md:gap-10 text-white/80 text-xs uppercase tracking-wider">
          <div className="border-t border-[#c9a24a]/40 pt-2">4 origenes</div>
          <div className="border-t border-[#c9a24a]/40 pt-2">Solo directos</div>
          <div className="border-t border-[#c9a24a]/40 pt-2">Datos en vivo</div>
        </div>
      </header>

      <RouteMap />

      <section className="bg-[#12151b] rounded-2xl border border-white/10 shadow-xl p-6 space-y-3">
        <h2 className="text-base font-semibold text-white">Busqueda en lenguaje natural</h2>
        <p className="text-sm text-white/50">
          Ej.: "vuelo a Polonia desde Alicante o Valencia, salida el 4 despues de las 18h o si no el 5 a partir de las 8h,
          regreso no antes de las 12h". Revisa siempre como se ha interpretado antes de buscar.
        </p>
        <textarea
          className="w-full bg-[#0a0c10] border border-white/10 rounded-lg p-3 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#c9a24a]/60 focus:border-[#c9a24a]/60"
          rows={2}
          value={nlpText}
          onChange={(e) => setNlpText(e.target.value)}
          placeholder="Describe tu busqueda en una frase..."
        />
        <button
          onClick={handleInterpret}
          className="bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors border border-white/10"
        >
          Interpretar y precargar filtros
        </button>
        {nlpWarnings.length > 0 && (
          <div className="text-amber-200 text-sm bg-amber-900/20 border border-amber-700/30 rounded-lg p-3">
            <p className="font-medium mb-1">Revisa la interpretacion:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {nlpWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="bg-[#12151b] rounded-2xl border border-white/10 shadow-xl p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <IconSliders className="w-5 h-5 text-[#c9a24a]" />
            <h2 className="text-base font-semibold text-white">Filtros de busqueda</h2>
          </div>
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" checked={travelIdeasMode} onChange={(e) => setTravelIdeasMode(e.target.checked)} />
            Quiero viajar, propon ideas
          </label>
        </div>

        <div>
          <p className="text-sm font-medium text-white/70 mb-2">Origenes</p>
          <div className="flex flex-wrap gap-2">
            {originsList.map((o) => (
              <label
                key={o.iata}
                className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                  originIatas.includes(o.iata)
                    ? 'bg-[#c9a24a] text-[#0a0c10] border-[#c9a24a] font-medium'
                    : 'bg-transparent border-white/20 text-white/70 hover:border-[#c9a24a]/60'
                }`}
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
            <IconMapPin className="w-4 h-4 text-[#c9a24a]" />
            <p className="text-sm font-medium text-white/70">
              Destinos ({filteredRealDestinations.length} vuelos directos reales desde tus origenes)
            </p>
          </div>
          {realDestError && (
            <p className="text-xs text-red-300 bg-red-900/20 border border-red-700/30 rounded p-2 mb-2">
              No se pudo cargar el listado: {realDestError}
            </p>
          )}
          <input
            type="text"
            placeholder="Filtrar por ciudad, pais o codigo IATA..."
            className="w-full bg-[#0a0c10] border border-white/10 rounded-lg p-2 text-sm text-white placeholder-white/30 mb-2"
            value={realDestFilter}
            onChange={(e) => setRealDestFilter(e.target.value)}
          />
          <div className="max-h-72 overflow-y-auto flex flex-wrap gap-1.5 border border-white/10 rounded-xl p-3 bg-[#0a0c10]">
            {Array.from(cityGroups.entries()).map(([city, airports]) => {
              const iatas = airports.map((a) => a.dest_iata);
              const countries = Array.from(new Set(airports.map((a) => a.country))).join(', ');
              const allSelected = iatas.every((i) => selectedDestIatas.includes(i));
              return (
                <div key={city} className="flex flex-wrap gap-1.5 items-center">
                  {airports.length > 1 && (
                    <label
                      className={`text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors font-medium ${
                        allSelected
                          ? 'bg-[#c9a24a] text-[#0a0c10] border-[#c9a24a]'
                          : 'bg-transparent border-[#c9a24a]/50 text-[#c9a24a] hover:bg-[#c9a24a]/10'
                      }`}
                      title={`Selecciona los ${airports.length} aeropuertos de ${city} a la vez`}
                    >
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={allSelected}
                        onChange={() => setSelectedDestIatas((prev) => toggleAll(prev, iatas))}
                      />
                      {city} (todos)
                    </label>
                  )}
                  {airports.map((d) => (
                    <label
                      key={d.dest_iata}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                        selectedDestIatas.includes(d.dest_iata)
                          ? 'bg-white text-[#0a0c10] border-white'
                          : 'bg-transparent border-white/15 text-white/70 hover:border-white/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={selectedDestIatas.includes(d.dest_iata)}
                        onChange={() => setSelectedDestIatas((prev) => toggle(prev, d.dest_iata))}
                      />
                      {d.dest_name} ({d.dest_iata})
                      <span className="ml-1 text-[10px] opacity-60">{countries}</span>
                    </label>
                  ))}
                </div>
              );
            })}
            {filteredRealDestinations.length === 0 && !realDestError && (
              <p className="text-white/30 text-xs">Sin resultados o cache aun no sincronizada.</p>
            )}
          </div>
          {selectedDestIatas.length > 0 && (
            <p className="text-xs text-white/40 mt-2">{selectedDestIatas.length} destino(s) seleccionado(s).</p>
          )}

          <div className="mt-4">
            <label className="text-xs font-medium text-white/70">
              Ciudades a descartar (opcional)
              <input
                type="text"
                placeholder="Codigos IATA separados por coma, ej: LHR, CDG, FCO"
                className="mt-1 w-full bg-[#0a0c10] border border-white/10 rounded-lg p-2 text-sm text-white placeholder-white/30"
                value={excludeIatasText}
                onChange={(e) => setExcludeIatasText(e.target.value)}
              />
            </label>
            <p className="text-[11px] text-white/30 mt-1">
              Se quitan del selector de destinos y, si ya buscaste, tambien de los resultados devueltos por el servidor.
            </p>
          </div>

          <div className="mt-4 bg-[#0a0c10] border border-white/10 rounded-xl p-3">
            <p className="text-xs text-white/60">
              ¿Buscas mercados navidenos, festivales de luces u otro evento de temporada? Descríbelo en el cuadro de
              "Busqueda en lenguaje natural" de arriba (ej. "mercado navideno en un pais nordico" o "festival de luces
              en Francia") en vez de elegir de una lista fija -- así no te repetimos siempre las mismas ciudades.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-white/10">
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-white/70">
              Ida desde
              <input
                type="date"
                className="mt-1 w-full bg-[#0a0c10] border border-white/10 rounded-lg p-2 text-sm text-white"
                value={outboundDateFrom}
                onChange={(e) => setOutboundDateFrom(e.target.value)}
              />
            </label>
            <label className="text-xs font-medium text-white/70">
              Ida hasta
              <input
                type="date"
                className="mt-1 w-full bg-[#0a0c10] border border-white/10 rounded-lg p-2 text-sm text-white"
                value={outboundDateTo}
                onChange={(e) => setOutboundDateTo(e.target.value)}
              />
            </label>
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-white/70">
              Vuelta desde
              <input
                type="date"
                className="mt-1 w-full bg-[#0a0c10] border border-white/10 rounded-lg p-2 text-sm text-white"
                value={inboundDateFrom}
                onChange={(e) => setInboundDateFrom(e.target.value)}
              />
            </label>
            <label className="text-xs font-medium text-white/70">
              Vuelta hasta
              <input
                type="date"
                className="mt-1 w-full bg-[#0a0c10] border border-white/10 rounded-lg p-2 text-sm text-white"
                value={inboundDateTo}
                onChange={(e) => setInboundDateTo(e.target.value)}
              />
            </label>
          </div>
          <label className="text-xs font-medium text-white/70">
            Adultos
            <input
              type="number"
              min={1}
              className="mt-1 w-full bg-[#0a0c10] border border-white/10 rounded-lg p-2 text-sm text-white"
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value))}
            />
          </label>
          <label className="text-xs font-medium text-white/70">
            Ninos
            <input
              type="number"
              min={0}
              className="mt-1 w-full bg-[#0a0c10] border border-white/10 rounded-lg p-2 text-sm text-white"
              value={children}
              onChange={(e) => setChildren(Number(e.target.value))}
            />
          </label>
          <label className="text-xs font-medium text-white/70">
            Ida no antes de (h)
            <input
              type="number"
              min={0}
              max={23}
              className="mt-1 w-full bg-[#0a0c10] border border-white/10 rounded-lg p-2 text-sm text-white"
              value={outboundNotBeforeHour}
              onChange={(e) => setOutboundNotBeforeHour(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
          <label className="text-xs font-medium text-white/70">
            Vuelta no antes de (h)
            <input
              type="number"
              min={0}
              max={23}
              className="mt-1 w-full bg-[#0a0c10] border border-white/10 rounded-lg p-2 text-sm text-white"
              value={inboundNotBeforeHour}
              onChange={(e) => setInboundNotBeforeHour(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
          <label className="text-xs font-medium text-white/70">
            Precio max. total
            <input
              type="number"
              min={0}
              className="mt-1 w-full bg-[#0a0c10] border border-white/10 rounded-lg p-2 text-sm text-white"
              value={maxPriceTotal}
              onChange={(e) => setMaxPriceTotal(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
          <label className="text-xs font-medium text-white/70">
            Ordenar por
            <select
              className="mt-1 w-full bg-[#0a0c10] border border-white/10 rounded-lg p-2 text-sm text-white"
              value={sortBy}
              onChange={(e) => handleReSort(e.target.value as any)}
            >
              <option value="checkout_time">Hora salida hotel</option>
              <option value="price">Precio total</option>
              <option value="duration">Duracion total</option>
            </select>
          </label>
          <label className="text-xs font-medium text-white/70 flex items-center gap-2 mt-5">
            <input type="checkbox" checked={requireCabinBaggage} onChange={(e) => setRequireCabinBaggage(e.target.checked)} />
            Exigir equipaje de mano
          </label>
          <label className="text-xs font-medium text-white/70 flex items-center gap-2 mt-5">
            <input type="checkbox" checked={allowOpenJaw} onChange={(e) => setAllowOpenJaw(e.target.checked)} />
            Permitir open-jaw en destino
          </label>
        </div>

        {!travelIdeasMode && (
          <p className="text-xs text-white/40">
            Combinaciones origen x destino: <strong className="text-white/70">{combos}</strong>
            {combos > 6 && <span className="text-red-300"> (maximo 6; reduce la seleccion)</span>}
          </p>
        )}
        <p className="text-xs text-amber-200/80 bg-amber-900/10 border border-amber-700/20 rounded-lg px-3 py-2">
          Maximo 5 dias por tramo y 6 combinaciones origen x destino, para no agotar la cuota gratuita de Ignav.
        </p>

        <button
          onClick={travelIdeasMode ? handleTravelIdeas : handleSearch}
          disabled={loading || originIatas.length === 0 || (!travelIdeasMode && destinationGroupIds.length === 0 && selectedDestIatas.length === 0)}
          className="bg-[#c9a24a] hover:bg-[#dab765] text-[#0a0c10] font-semibold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-40"
        >
          {loading ? 'Buscando...' : travelIdeasMode ? 'Proponme ideas de viaje' : 'Buscar vuelos'}
        </button>

        {error && <p className="text-red-300 text-sm">{error}</p>}
        {warnings.length > 0 && (
          <div className="text-amber-200 text-sm bg-amber-900/20 border border-amber-700/30 rounded-lg p-3">
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
        <section className="bg-[#12151b] rounded-2xl border border-white/10 shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Resultados ({liveResults.length})</h2>
            <select
              className="bg-[#0a0c10] border border-white/10 rounded-lg p-1.5 text-xs text-white"
              value={sortBy}
              onChange={(e) => handleReSort(e.target.value as any)}
            >
              <option value="checkout_time">Hora salida hotel</option>
              <option value="price">Precio total</option>
              <option value="duration">Duracion total</option>
            </select>
          </div>
          {liveResults.length === 0 && (
            <p className="text-sm text-white/40">Sin itinerarios directos que cumplan los filtros. Revisa los avisos de arriba.</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-white/80">
              <thead>
                <tr className="text-left border-b border-white/10 text-white/40">
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
                {liveResults.map((r: any) => {
                  const rowKey = `${r.outbound.ignav_id}-${r.inbound.ignav_id}`;
                  return (
                    <tr key={rowKey} className="border-b border-white/5 align-top">
                      <td className="p-2 font-medium text-white">
                        {r.originIata} to {r.destinationGroupName}
                        {r.isSingleIataTarget && <span className="ml-1 text-[10px] text-white/30">(destino suelto)</span>}
                      </td>
                      <td className="p-2">
                        {r.outbound.airline} {r.outbound.flight_number}
                        <br />
                        {r.outbound.origin_iata} to {r.outbound.destination_iata}
                        <br />
                        {new Date(r.outbound.departure_at).toLocaleString('es-ES')}
                      </td>
                      <td className="p-2">
                        {r.inbound.airline} {r.inbound.flight_number}
                        <br />
                        {r.inbound.origin_iata} to {r.inbound.destination_iata}
                        <br />
                        {new Date(r.inbound.departure_at).toLocaleString('es-ES')}
                      </td>
                      <td className="p-2">{r.isOpenJaw ? 'Si' : 'No'}</td>
                      <td className="p-2 font-medium text-[#c9a24a]">
                        {r.totalPrice.toFixed(2)} {r.currency}
                      </td>
                      <td className="p-2">{new Date(r.hotelCheckoutAt).toLocaleString('es-ES')}</td>
                      <td className="p-2 text-white/40">{r.notes.join(' ')}</td>
                      <td className="p-2">
                        <button
                          className="text-[#c9a24a] hover:text-[#dab765] underline text-xs"
                          onClick={() => handleShowLinks(rowKey, r.outbound.ignav_id)}
                          disabled={loadingLinks === rowKey}
                        >
                          {loadingLinks === rowKey ? 'Cargando...' : 'Ver enlaces ida'}
                        </button>
                        {bookingLinks[rowKey] && (
                          <ul className="mt-1 space-y-1">
                            {bookingLinks[rowKey].map((link, j) => (
                              <li key={j}>
                                <a
                                  href={link.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-[#c9a24a] hover:text-[#dab765] underline"
                                >
                                  {link.provider_name} {link.price ? `(${link.price.amount} ${link.price.currency})` : ''}
                                </a>
                              </li>
                            ))}
                            {bookingLinks[rowKey].length === 0 && <li className="text-xs text-white/30">Sin enlaces disponibles</li>}
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

      <p className="text-xs text-white/20 text-center">
        Datos en vivo de la API de Ignav. Cada dia adicional y cada combinacion origen x destino consume peticiones de
        la cuota gratuita. Los destinos reales se sincronizan a diario contra los datos publicos de Aena.
      </p>
    </div>
  );
}
