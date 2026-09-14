'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LiveItinerary } from '@/lib/live-engine';
import { parseSearchQuery } from '@/lib/nlp-search';
import { buildShareUrl, parseShareParams, summarizeFilters } from '@/lib/share-link';
import { addSearchHistoryEntry } from '@/lib/search-history';
import TopNav from '@/components/TopNav';
import FlightPathStrip from '@/components/FlightPathStrip';
import ToolsPanel from '@/components/ToolsPanel';
import FlightResultCard from '@/components/FlightResultCard';
import FilterAccordion from '@/components/FilterAccordion';
import SearchHistoryPanel from '@/components/SearchHistoryPanel';
import { IconSliders, IconMapPin, IconTicket, IconShare } from '@/components/Icons';

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
  const [includeSkyScanner, setIncludeSkyScanner] = useState(false);
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

  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState('Buscando...');

  useEffect(() => {
    fetch('/api/meta')
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setError('No se pudo cargar la configuracion inicial.'));
  }, []);

  // Restaurar filtros desde la URL si viene de un enlace compartido o de una entrada
  // del historial de busquedas (mismo formato, ver lib/share-link.ts).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.search) return;
    const parsed = parseShareParams(window.location.search);
    if (parsed.originIatas) setOriginIatas(parsed.originIatas);
    if (parsed.destinationGroupIds) setDestinationGroupIds(parsed.destinationGroupIds);
    if (parsed.selectedDestIatas) setSelectedDestIatas(parsed.selectedDestIatas);
    if (parsed.outboundDateFrom) setOutboundDateFrom(parsed.outboundDateFrom);
    if (parsed.outboundDateTo) setOutboundDateTo(parsed.outboundDateTo);
    if (parsed.inboundDateFrom) setInboundDateFrom(parsed.inboundDateFrom);
    if (parsed.inboundDateTo) setInboundDateTo(parsed.inboundDateTo);
    if (parsed.adults !== undefined) setAdults(parsed.adults);
    if (parsed.children !== undefined) setChildren(parsed.children);
    if (parsed.maxPriceTotal !== undefined) setMaxPriceTotal(parsed.maxPriceTotal);
    if (parsed.sortBy) setSortBy(parsed.sortBy);
    if (parsed.requireCabinBaggage !== undefined) setRequireCabinBaggage(parsed.requireCabinBaggage);
    if (parsed.allowOpenJaw !== undefined) setAllowOpenJaw(parsed.allowOpenJaw);
    if (parsed.includeSkyScanner !== undefined) setIncludeSkyScanner(parsed.includeSkyScanner);
    if (parsed.outboundNotBeforeHour !== undefined) setOutboundNotBeforeHour(parsed.outboundNotBeforeHour);
    if (parsed.inboundNotBeforeHour !== undefined) setInboundNotBeforeHour(parsed.inboundNotBeforeHour);
    if (parsed.excludeIatasText !== undefined) setExcludeIatasText(parsed.excludeIatasText);
  }, []);

  // Mensajes de progreso mientras se busca. Con hasta varias decenas de peticiones a
  // Ignav en paralelo, una busqueda puede tardar unos segundos sin ningun feedback --
  // esto NO es progreso real medido (la API no lo expone), solo mensajes honestos que
  // van cambiando para que no parezca colgado.
  useEffect(() => {
    if (!loading) {
      setProgressMessage('Buscando...');
      return;
    }
    const messages = [
      'Consultando vuelos de ida...',
      'Consultando vuelos de vuelta...',
      'Cruzando combinaciones ida y vuelta...',
      'Calculando traslados y horas de salida del hotel...'
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % messages.length;
      setProgressMessage(messages[i]);
    }, 1500);
    setProgressMessage(messages[0]);
    return () => clearInterval(interval);
  }, [loading]);

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

  const originLabels = useMemo(
    () => originIatas.map((iata) => (meta?.origins ?? []).find((o) => o.iata === iata)?.city ?? iata),
    [originIatas, meta]
  );
  const destinationLabels = useMemo(() => {
    const groupNames = destinationGroupIds.map((id) => (meta?.groups ?? []).find((g) => g.id === id)?.name ?? id);
    const iataNames = selectedDestIatas.map(
      (iata) => realDestinations.find((d) => d.dest_iata === iata)?.dest_name ?? iata
    );
    return [...groupNames, ...iataNames];
  }, [destinationGroupIds, selectedDestIatas, meta, realDestinations]);

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

  async function runSearch(groupIdsOverride?: string[], iataOverride?: string[], sortOverride?: 'checkout_time' | 'price' | 'duration') {
    setLoading(true);
    setError(null);
    setWarnings([]);
    setBookingLinks({});
    const groupIds = groupIdsOverride ?? destinationGroupIds;
    const iatas = iataOverride ?? selectedDestIatas;
    const effectiveSortBy = sortOverride ?? sortBy;
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
      includeSkyScanner,
      outboundNotBeforeHour: outboundNotBeforeHour === '' ? undefined : Number(outboundNotBeforeHour),
      inboundNotBeforeHour: inboundNotBeforeHour === '' ? undefined : Number(inboundNotBeforeHour),
      maxPriceTotal: maxPriceTotal === '' ? undefined : Number(maxPriceTotal),
      sortBy: effectiveSortBy
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
      setLiveResults(sortResults(data.itineraries ?? [], effectiveSortBy));

      const shareFilters = {
        originIatas,
        destinationGroupIds: groupIds,
        selectedDestIatas: iatas,
        outboundDateFrom,
        outboundDateTo,
        inboundDateFrom,
        inboundDateTo,
        adults,
        children,
        maxPriceTotal,
        sortBy: effectiveSortBy,
        requireCabinBaggage,
        allowOpenJaw,
        includeSkyScanner,
        outboundNotBeforeHour,
        inboundNotBeforeHour,
        excludeIatasText
      };
      const url = buildShareUrl(shareFilters);
      const label = summarizeFilters(shareFilters, destinationLabels[0] ?? '');
      addSearchHistoryEntry(label, url);
      window.dispatchEvent(new Event('tiriti:search-history-updated'));
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
    // Mejora (revision de logica): antes esto solo ampliaba a todos los destinos
    // curados y usaba el criterio de orden que estuviera puesto en ese momento (podia
    // no ser precio) -- no habia ninguna logica real de "proponer ideas". Ahora fuerza
    // explicitamente ordenar por precio, que es lo unico que tiene sentido para "dame
    // ideas" sin mas contexto, y lo refleja en el desplegable para que no quede oculto.
    setSortBy('price');
    await runSearch(allGroupIds, [], 'price');
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

  function currentShareFilters() {
    return {
      originIatas,
      destinationGroupIds,
      selectedDestIatas,
      outboundDateFrom,
      outboundDateTo,
      inboundDateFrom,
      inboundDateTo,
      adults,
      children,
      maxPriceTotal,
      sortBy,
      requireCabinBaggage,
      allowOpenJaw,
      includeSkyScanner,
      outboundNotBeforeHour,
      inboundNotBeforeHour,
      excludeIatasText
    };
  }

  async function handleShare() {
    const url = buildShareUrl(currentShareFilters());
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Tiriti Travel - busqueda', url });
        return;
      } catch {
        // El usuario cancelo el share sheet o no esta soportado -- caer al portapapeles.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage('Enlace copiado al portapapeles.');
    } catch {
      setShareMessage(url);
    }
    setTimeout(() => setShareMessage(null), 4000);
  }

  function handleRestoreFromHistory(url: string) {
    const [, search] = url.split('?');
    if (!search) return;
    const parsed = parseShareParams(`?${search}`);
    if (parsed.originIatas) setOriginIatas(parsed.originIatas);
    if (parsed.destinationGroupIds) setDestinationGroupIds(parsed.destinationGroupIds);
    if (parsed.selectedDestIatas) setSelectedDestIatas(parsed.selectedDestIatas);
    if (parsed.outboundDateFrom) setOutboundDateFrom(parsed.outboundDateFrom);
    if (parsed.outboundDateTo) setOutboundDateTo(parsed.outboundDateTo);
    if (parsed.inboundDateFrom) setInboundDateFrom(parsed.inboundDateFrom);
    if (parsed.inboundDateTo) setInboundDateTo(parsed.inboundDateTo);
    if (parsed.adults !== undefined) setAdults(parsed.adults);
    if (parsed.children !== undefined) setChildren(parsed.children);
    if (parsed.maxPriceTotal !== undefined) setMaxPriceTotal(parsed.maxPriceTotal);
    if (parsed.sortBy) setSortBy(parsed.sortBy);
    if (parsed.requireCabinBaggage !== undefined) setRequireCabinBaggage(parsed.requireCabinBaggage);
    if (parsed.allowOpenJaw !== undefined) setAllowOpenJaw(parsed.allowOpenJaw);
    if (parsed.includeSkyScanner !== undefined) setIncludeSkyScanner(parsed.includeSkyScanner);
    if (parsed.outboundNotBeforeHour !== undefined) setOutboundNotBeforeHour(parsed.outboundNotBeforeHour);
    if (parsed.inboundNotBeforeHour !== undefined) setInboundNotBeforeHour(parsed.inboundNotBeforeHour);
    if (parsed.excludeIatasText !== undefined) setExcludeIatasText(parsed.excludeIatasText);
    setLiveResults(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const originsList = meta?.origins ?? [{ iata: 'ALC', city: 'Alicante' }];

  const sortSelect = (
    <select
      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100"
      value={sortBy}
      onChange={(e) => handleReSort(e.target.value as any)}
    >
      <option value="checkout_time">Hora salida hotel</option>
      <option value="price">Precio total</option>
      <option value="duration">Duracion total</option>
    </select>
  );

  return (
    <div className="min-h-screen md:p-6 lg:p-10">
      <div className="md:max-w-[1400px] md:mx-auto bg-gradient-to-b from-[#eef1ff] via-[#f7f8fd] to-white dark:from-slate-950 dark:via-slate-950 dark:to-black md:rounded-[2rem] md:shadow-2xl md:ring-1 md:ring-black/5 dark:md:ring-white/10 overflow-hidden">
        <TopNav />
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
          <div>
            <h1 className="font-display text-2xl md:text-3xl text-ink dark:text-slate-100">
              Vuelos directos, <span className="text-indigo not-italic">sin escalas.</span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Ida y vuelta sin escalas desde Alicante, Madrid, Valencia y Murcia. Datos en vivo de Ignav, nunca estimaciones.
            </p>
          </div>

          <FlightPathStrip originLabels={originLabels} destinationLabels={destinationLabels} combos={combos} />

          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 md:p-6 space-y-3">
            <h2 className="text-base font-semibold text-ink dark:text-slate-100">Busqueda en lenguaje natural</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Ej.: "vuelo a Polonia desde Alicante o Valencia, salida el 4 despues de las 18h o si no el 5 a partir de las 8h,
              regreso no antes de las 12h". Revisa siempre como se ha interpretado antes de buscar.
            </p>
            <textarea
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm text-ink dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo/40 focus:border-indigo/60"
              rows={2}
              value={nlpText}
              onChange={(e) => setNlpText(e.target.value)}
              placeholder="Describe tu busqueda en una frase..."
            />
            <button
              onClick={handleInterpret}
              className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-ink dark:text-slate-100 text-sm font-medium px-4 py-2 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
            >
              Interpretar y precargar filtros
            </button>
            {nlpWarnings.length > 0 && (
              <div className="text-amber-800 dark:text-amber-200 text-sm bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="font-medium mb-1">Revisa la interpretacion:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {nlpWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
            <div className="space-y-6 min-w-0">
              <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 md:p-6 space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <IconSliders className="w-5 h-5 text-indigo" />
                    <h2 className="text-base font-semibold text-ink dark:text-slate-100">Quien, cuando y a donde</h2>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={travelIdeasMode} onChange={(e) => setTravelIdeasMode(e.target.checked)} />
                    Quiero viajar, propon ideas por precio
                  </label>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Origenes</p>
                  <div className="flex flex-wrap gap-2">
                    {originsList.map((o) => (
                      <label
                        key={o.iata}
                        className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                          originIatas.includes(o.iata)
                            ? 'bg-indigo text-white border-indigo font-medium'
                            : 'bg-transparent border-slate-200 text-slate-600 hover:border-indigo/60'
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
                    <IconMapPin className="w-4 h-4 text-indigo" />
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      Destinos ({filteredRealDestinations.length} vuelos directos reales desde tus origenes)
                    </p>
                  </div>
                  {realDestError && (
                    <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded p-2 mb-2">
                      No se pudo cargar el listado: {realDestError}
                    </p>
                  )}
                  <input
                    type="text"
                    placeholder="Filtrar por ciudad, pais o codigo IATA..."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 mb-2"
                    value={realDestFilter}
                    onChange={(e) => setRealDestFilter(e.target.value)}
                  />
                  <div className="max-h-72 overflow-y-auto flex flex-wrap gap-1.5 border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-slate-50 dark:bg-slate-800">
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
                                  ? 'bg-indigo text-white border-indigo'
                                  : 'bg-transparent border-indigo/50 text-indigo hover:bg-indigo/10'
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
                                  ? 'bg-ink text-white border-ink'
                                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'
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
                      <p className="text-slate-400 dark:text-slate-500 text-xs">Sin resultados o cache aun no sincronizada.</p>
                    )}
                  </div>
                  {selectedDestIatas.length > 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{selectedDestIatas.length} destino(s) seleccionado(s).</p>
                  )}

                  <div className="mt-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      ¿Buscas mercados navidenos, festivales de luces u otro evento de temporada? Descríbelo en el cuadro de
                      "Busqueda en lenguaje natural" de arriba (ej. "mercado navideno en un pais nordico" o "festival de luces
                      en Francia") en vez de elegir de una lista fija -- así no te repetimos siempre las mismas ciudades.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="col-span-2 grid grid-cols-2 gap-3">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Ida desde
                      <input
                        type="date"
                        className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100"
                        value={outboundDateFrom}
                        onChange={(e) => setOutboundDateFrom(e.target.value)}
                      />
                    </label>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Ida hasta
                      <input
                        type="date"
                        className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100"
                        value={outboundDateTo}
                        onChange={(e) => setOutboundDateTo(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-3">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Vuelta desde
                      <input
                        type="date"
                        className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100"
                        value={inboundDateFrom}
                        onChange={(e) => setInboundDateFrom(e.target.value)}
                      />
                    </label>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Vuelta hasta
                      <input
                        type="date"
                        className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100"
                        value={inboundDateTo}
                        onChange={(e) => setInboundDateTo(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Adultos
                    <input
                      type="number"
                      min={1}
                      className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100"
                      value={adults}
                      onChange={(e) => setAdults(Number(e.target.value))}
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Ninos
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100"
                      value={children}
                      onChange={(e) => setChildren(Number(e.target.value))}
                    />
                  </label>
                </div>

                {!travelIdeasMode && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Combinaciones origen x destino: <strong className="text-ink dark:text-slate-100">{combos}</strong>
                    {combos > 6 && <span className="text-red-500 dark:text-red-400"> (maximo 6; reduce la seleccion)</span>}
                  </p>
                )}
                <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  Maximo 5 dias por tramo y 6 combinaciones origen x destino, para no agotar la cuota gratuita de Ignav.
                </p>

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={travelIdeasMode ? handleTravelIdeas : handleSearch}
                    disabled={loading || originIatas.length === 0 || (!travelIdeasMode && destinationGroupIds.length === 0 && selectedDestIatas.length === 0)}
                    className="bg-indigo hover:bg-indigo-dark text-white font-semibold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-40"
                  >
                    {loading ? progressMessage : travelIdeasMode ? 'Proponme ideas por precio' : 'Buscar vuelos'}
                  </button>
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-indigo px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo/40 transition-colors"
                  >
                    <IconShare className="w-4 h-4" />
                    Compartir esta busqueda
                  </button>
                  {shareMessage && <span className="text-xs text-emerald-600 dark:text-emerald-400">{shareMessage}</span>}
                </div>

                {error && <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>}
                {warnings.length > 0 && (
                  <div className="text-amber-800 dark:text-amber-200 text-sm bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <p className="font-medium mb-1">Avisos de la busqueda:</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              {liveResults && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <IconTicket className="w-5 h-5 text-indigo" />
                      <div>
                        <h2 className="font-display text-lg text-ink dark:text-slate-100">Vuelos disponibles</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{liveResults.length} resultados</p>
                      </div>
                    </div>
                    <div className="w-44">{sortSelect}</div>
                  </div>

                  {liveResults.length === 0 && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 text-center">
                      Sin itinerarios directos que cumplan los filtros. Revisa los avisos de arriba.
                    </p>
                  )}

                  <div className="space-y-3">
                    {liveResults.map((r) => {
                      const rowKey = `${r.outbound.ignav_id}-${r.inbound.ignav_id}`;
                      return (
                        <FlightResultCard
                          key={rowKey}
                          result={r}
                          bookingLinks={bookingLinks[rowKey]}
                          loadingLinks={loadingLinks === rowKey}
                          onShowLinks={() => handleShowLinks(rowKey, r.outbound.ignav_id)}
                        />
                      );
                    })}
                  </div>
                </section>
              )}
            </div>

            <aside className="space-y-4 lg:sticky lg:top-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-ink dark:text-slate-100 mb-1">Filtros y ajustes</h2>
                <FilterAccordion title="Horarios" defaultOpen>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block">
                    Ida no antes de las (h)
                    <input
                      type="number"
                      min={0}
                      max={23}
                      className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100"
                      value={outboundNotBeforeHour}
                      onChange={(e) => setOutboundNotBeforeHour(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block">
                    Vuelta no antes de las (h)
                    <input
                      type="number"
                      min={0}
                      max={23}
                      className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100"
                      value={inboundNotBeforeHour}
                      onChange={(e) => setInboundNotBeforeHour(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </label>
                </FilterAccordion>

                <FilterAccordion title="Precio y orden" defaultOpen>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block">
                    Precio maximo total
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100"
                      value={maxPriceTotal}
                      onChange={(e) => setMaxPriceTotal(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block">
                    Ordenar por
                    {sortSelect}
                  </label>
                </FilterAccordion>

                <FilterAccordion title="Extras">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <input type="checkbox" checked={requireCabinBaggage} onChange={(e) => setRequireCabinBaggage(e.target.checked)} />
                    Exigir equipaje de mano
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <input type="checkbox" checked={allowOpenJaw} onChange={(e) => setAllowOpenJaw(e.target.checked)} />
                    Permitir llegar y salir por aeropuertos distintos (open-jaw)
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <input type="checkbox" checked={includeSkyScanner} onChange={(e) => setIncludeSkyScanner(e.target.checked)} />
                    Incluir Sky Scrapper (cuota mensual limitada)
                  </label>
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Ciudades a descartar
                      <input
                        type="text"
                        placeholder="Ej: LHR, CDG, FCO"
                        className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                        value={excludeIatasText}
                        onChange={(e) => setExcludeIatasText(e.target.value)}
                      />
                    </label>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Se quitan del selector y de los resultados.</p>
                  </div>
                </FilterAccordion>
              </div>

              <SearchHistoryPanel onRestore={handleRestoreFromHistory} />

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
            </aside>
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
            Datos en vivo de la API de Ignav. Cada dia adicional y cada combinacion origen x destino consume peticiones de
            la cuota gratuita. Los destinos reales se sincronizan a diario contra los datos publicos de Aena.
          </p>
        </div>
      </div>
    </div>
  );
}
