'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LiveItinerary } from '@/lib/live-engine';
import { datesBetween } from '@/lib/types';
import DayPicker from '@/components/DayPicker';
import DayHoursList, { type DayHours } from '@/components/DayHoursList';
import { parseSearchQuery } from '@/lib/nlp-search';
import { buildShareUrl, parseShareParams, summarizeFilters } from '@/lib/share-link';
import { addSearchHistoryEntry } from '@/lib/search-history';
import { getTravelProfile, saveTravelProfile } from '@/lib/travel-profile';
import { getVisitedDestinations, toggleVisitedDestination } from '@/lib/visited-destinations';
import { saveOfflineCache, getOfflineCache } from '@/lib/offline-cache';
import TopNav from '@/components/TopNav';
import ToolsPanel from '@/components/ToolsPanel';
import ResultsSection from '@/components/ResultsSection';
import FilterAccordion from '@/components/FilterAccordion';
import SearchHistoryPanel from '@/components/SearchHistoryPanel';
import ExploreDestinations from '@/components/ExploreDestinations';
import { IconSliders, IconMapPin, IconShare, IconSparkles, IconChevronDown, IconWhatsApp, IconX } from '@/components/Icons';

type Meta = {
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

// FIX (bug real reportado): usar Date.toISOString() para fechas locales desplaza el
// dia en zonas horarias por delante de UTC (España en invierno es UTC+1) -- la
// medianoche local del dia X puede caer en las 23h UTC del dia X-1. Este helper
// construye el ISO directamente desde año/mes/dia LOCALES, sin pasar por UTC en ningun
// momento.
function localDateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  const [originIatas, setOriginIatas] = useState<string[]>(() => getTravelProfile()?.originIatas ?? ['ALC']);
  const [selectedDestIatas, setSelectedDestIatas] = useState<string[]>([]);
  const [excludeIatasText, setExcludeIatasText] = useState('');
  const [airlinesIncludeText, setAirlinesIncludeText] = useState('');
  const [airlinesExcludeText, setAirlinesExcludeText] = useState('');
  const [outboundDateFrom, setOutboundDateFrom] = useState('2026-12-04');
  const [outboundDateTo, setOutboundDateTo] = useState('2026-12-05');
  const [inboundDateFrom, setInboundDateFrom] = useState('2026-12-08');
  const [inboundDateTo, setInboundDateTo] = useState('2026-12-08');
  const [outboundSelectedDays, setOutboundSelectedDays] = useState<string[]>(['2026-12-04', '2026-12-05']);
  const [inboundSelectedDays, setInboundSelectedDays] = useState<string[]>(['2026-12-08']);
  const [outboundDayHours, setOutboundDayHours] = useState<Record<string, DayHours>>({});
  const [inboundDayHours, setInboundDayHours] = useState<Record<string, DayHours>>({});
  const [adults, setAdults] = useState(() => getTravelProfile()?.adults ?? 2);
  const [children, setChildren] = useState(() => getTravelProfile()?.children ?? 1);
  const [requireCabinBaggage, setRequireCabinBaggage] = useState(() => getTravelProfile()?.requireCabinBaggage ?? false);
  const [allowOpenJaw, setAllowOpenJaw] = useState(() => getTravelProfile()?.allowOpenJaw ?? true);
  const [includeSkyScanner, setIncludeSkyScanner] = useState(false);
  const [outboundNotBeforeHour, setOutboundNotBeforeHour] = useState<number | ''>('');
  const [inboundNotBeforeHour, setInboundNotBeforeHour] = useState<number | ''>(6);
  const [outboundNotAfterHour, setOutboundNotAfterHour] = useState<number | ''>('');
  const [inboundNotAfterHour, setInboundNotAfterHour] = useState<number | ''>('');
  const [maxPriceTotal, setMaxPriceTotal] = useState<number | ''>('');
  const [sortBy, setSortBy] = useState<'checkout_time' | 'price' | 'duration'>('price');
  const [liveResults, setLiveResults] = useState<LiveItinerary[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingLinks, setBookingLinks] = useState<BookingLinksState>({});
  const [loadingLinks, setLoadingLinks] = useState<string | null>(null);

  const [nlpText, setNlpText] = useState('');
  const [nlpWarnings, setNlpWarnings] = useState<string[]>([]);
  const [nlpExplanation, setNlpExplanation] = useState<string | null>(null);
  const [nlpUsedAI, setNlpUsedAI] = useState(false);
  const [nlpInterpreting, setNlpInterpreting] = useState(false);
  const [surprisePicking, setSurprisePicking] = useState(false);
  const [surpriseExplanation, setSurpriseExplanation] = useState<string | null>(null);
  const [aiRecommendation, setAiRecommendation] = useState<{ rowKey: string; explanation: string } | null>(null);
  const [recommending, setRecommending] = useState(false);
  const [comboLimit, setComboLimit] = useState(6);
  const [isOfflineResult, setIsOfflineResult] = useState(false);

  useEffect(() => {
    fetch('/api/ignav-usage')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.comboLimit) setComboLimit(data.comboLimit);
      })
      .catch(() => {});
  }, []);

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

  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.search) return;
    const parsed = parseShareParams(window.location.search);
    if (parsed.originIatas) setOriginIatas(parsed.originIatas);
    if (parsed.selectedDestIatas) setSelectedDestIatas(parsed.selectedDestIatas);
    if (parsed.outboundDateFrom) setOutboundDateFrom(parsed.outboundDateFrom);
    if (parsed.outboundDateTo) setOutboundDateTo(parsed.outboundDateTo);
    if (parsed.inboundDateFrom) setInboundDateFrom(parsed.inboundDateFrom);
    if (parsed.inboundDateTo) setInboundDateTo(parsed.inboundDateTo);
    if (parsed.outboundDateFrom || parsed.outboundDateTo) {
      syncOutboundRangeToDays(parsed.outboundDateFrom ?? outboundDateFrom, parsed.outboundDateTo ?? outboundDateTo);
    }
    if (parsed.inboundDateFrom || parsed.inboundDateTo) {
      syncInboundRangeToDays(parsed.inboundDateFrom ?? inboundDateFrom, parsed.inboundDateTo ?? inboundDateTo);
    }
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
    if (parsed.airlinesIncludeText !== undefined) setAirlinesIncludeText(parsed.airlinesIncludeText);
    if (parsed.airlinesExcludeText !== undefined) setAirlinesExcludeText(parsed.airlinesExcludeText);
  }, []);

  useEffect(() => {
    saveTravelProfile({ originIatas, adults, children, requireCabinBaggage, allowOpenJaw });
  }, [originIatas, adults, children, requireCabinBaggage, allowOpenJaw]);

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

  const combos = originIatas.length * selectedDestIatas.length;

  const excludeIatas = useMemo(
    () =>
      excludeIatasText
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    [excludeIatasText]
  );

  const airlinesInclude = useMemo(
    () => airlinesIncludeText.split(',').map((s) => s.trim()).filter(Boolean),
    [airlinesIncludeText]
  );
  const airlinesExclude = useMemo(
    () => airlinesExcludeText.split(',').map((s) => s.trim()).filter(Boolean),
    [airlinesExcludeText]
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
  const destinationLabels = useMemo(
    () => selectedDestIatas.map((iata) => realDestinations.find((d) => d.dest_iata === iata)?.dest_name ?? iata),
    [selectedDestIatas, realDestinations]
  );

  async function handleInterpret() {
    if (!meta || !nlpText.trim()) return;
    setNlpInterpreting(true);
    setNlpExplanation(null);
    const refDate = new Date(outboundDateFrom || Date.now());

    try {
      const res = await fetch('/api/ai-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: nlpText,
          referenceDate: outboundDateFrom || new Date().toISOString().slice(0, 10),
          origins: meta.origins,
          realDestinations: realDestinations.map((d) => ({ dest_iata: d.dest_iata, dest_name: d.dest_name, country: d.country }))
        })
      });
      if (!res.ok) throw new Error('IA no disponible');
      const ai = await res.json();

      if (ai.originIatas?.length) setOriginIatas(ai.originIatas);
      if (ai.destinationIatas?.length) setSelectedDestIatas(ai.destinationIatas);
      if (ai.outboundDateFrom) setOutboundDateFrom(ai.outboundDateFrom);
      if (ai.outboundDateTo) setOutboundDateTo(ai.outboundDateTo);
      if (ai.inboundDateFrom) setInboundDateFrom(ai.inboundDateFrom);
      if (ai.inboundDateTo) setInboundDateTo(ai.inboundDateTo);
      if (ai.outboundDateFrom || ai.outboundDateTo) {
        syncOutboundRangeToDays(ai.outboundDateFrom ?? outboundDateFrom, ai.outboundDateTo ?? outboundDateTo);
      }
      if (ai.inboundDateFrom || ai.inboundDateTo) {
        syncInboundRangeToDays(ai.inboundDateFrom ?? inboundDateFrom, ai.inboundDateTo ?? inboundDateTo);
      }
      if (ai.outboundNotBeforeHour !== null && ai.outboundNotBeforeHour !== undefined) setOutboundNotBeforeHour(ai.outboundNotBeforeHour);
      if (ai.inboundNotBeforeHour !== null && ai.inboundNotBeforeHour !== undefined) setInboundNotBeforeHour(ai.inboundNotBeforeHour);
      if (ai.maxPriceTotal !== null && ai.maxPriceTotal !== undefined) setMaxPriceTotal(ai.maxPriceTotal);
      setNlpExplanation(typeof ai.explanation === 'string' ? ai.explanation : null);
      setNlpWarnings(Array.isArray(ai.warnings) ? ai.warnings : []);
      setNlpUsedAI(true);
    } catch {
      const parsed = parseSearchQuery(nlpText, meta, { year: refDate.getFullYear(), month: refDate.getMonth() + 1 });
      if (parsed.originIatas.length) setOriginIatas(parsed.originIatas);
      if (parsed.outboundDateFrom) setOutboundDateFrom(parsed.outboundDateFrom);
      if (parsed.outboundDateTo) setOutboundDateTo(parsed.outboundDateTo);
      if (parsed.inboundDateFrom) setInboundDateFrom(parsed.inboundDateFrom);
      if (parsed.inboundDateTo) setInboundDateTo(parsed.inboundDateTo);
      if (parsed.outboundDateFrom || parsed.outboundDateTo) {
        syncOutboundRangeToDays(parsed.outboundDateFrom ?? outboundDateFrom, parsed.outboundDateTo ?? outboundDateTo);
      }
      if (parsed.inboundDateFrom || parsed.inboundDateTo) {
        syncInboundRangeToDays(parsed.inboundDateFrom ?? inboundDateFrom, parsed.inboundDateTo ?? inboundDateTo);
      }
      if (parsed.outboundNotBeforeHour !== undefined) setOutboundNotBeforeHour(parsed.outboundNotBeforeHour);
      if (parsed.inboundNotBeforeHour !== undefined) setInboundNotBeforeHour(parsed.inboundNotBeforeHour);
      setNlpWarnings(parsed.warnings);
      setNlpExplanation(null);
      setNlpUsedAI(false);
    } finally {
      setNlpInterpreting(false);
    }
  }

  async function runSearch(iataOverride?: string[], sortOverride?: 'checkout_time' | 'price' | 'duration') {
    setLoading(true);
    setError(null);
    setWarnings([]);
    setBookingLinks({});
    const iatas = iataOverride ?? selectedDestIatas;
    const effectiveSortBy = sortOverride ?? sortBy;
    const payload = {
      originIatas,
      destinationIatas: iatas,
      excludeIatas,
      airlinesInclude,
      airlinesExclude,
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
      outboundNotAfterHour: outboundNotAfterHour === '' ? undefined : Number(outboundNotAfterHour),
      inboundNotAfterHour: inboundNotAfterHour === '' ? undefined : Number(inboundNotAfterHour),
      outboundDates: outboundSelectedDays,
      inboundDates: inboundSelectedDays,
      outboundDayHours,
      inboundDayHours,
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
      const sortedResults = sortResults(data.itineraries ?? [], effectiveSortBy);
      setLiveResults(sortedResults);
      setIsOfflineResult(false);
      if (sortedResults.length > 0) {
        saveOfflineCache(sortedResults, `${originIatas.join('/')} -> ${destinationLabels[0] ?? ''}`);
      }
      setAiRecommendation(null);
      if (sortedResults.length > 0) requestAiRecommendation(sortedResults);

      const shareFilters = {
        originIatas,
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
        excludeIatasText,
        airlinesIncludeText,
        airlinesExcludeText
      };
      const url = buildShareUrl(shareFilters);
      const label = summarizeFilters(shareFilters, destinationLabels[0] ?? '');
      addSearchHistoryEntry(label, url);
      window.dispatchEvent(new Event('tiriti:search-history-updated'));
    } catch (e: any) {
      // Si el fallo es de RED (sin conexion), no un error normal de la busqueda,
      // ofrece la ultima busqueda guardada en el propio telefono en vez de un error
      // seco -- no es una PWA offline completa, solo el ultimo resultado visto.
      const isNetworkError = e instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine);
      if (isNetworkError) {
        const cached = getOfflineCache();
        if (cached && cached.itineraries.length > 0) {
          setLiveResults(cached.itineraries as LiveItinerary[]);
          setIsOfflineResult(true);
          setError(null);
        } else {
          setError('Sin conexion y sin ninguna busqueda guardada todavia para mostrar.');
        }
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function requestAiRecommendation(results: LiveItinerary[]) {
    setRecommending(true);
    try {
      const summarized = results.slice(0, 12).map((r) => ({
        originIata: r.originIata,
        destinationName: r.destinationName,
        outboundDepartureAt: r.outbound.departure_at,
        inboundDepartureAt: r.inbound.departure_at,
        totalPrice: r.totalPrice,
        currency: r.currency,
        hotelCheckoutAt: r.hotelCheckoutAt,
        isOpenJaw: r.isOpenJaw,
        source: r.source
      }));
      const res = await fetch('/api/ai-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itineraries: summarized })
      });
      if (!res.ok) return;
      const data = await res.json();
      const picked = results[data.recommendedIndex];
      if (!picked) return;
      const rowKey = `${picked.outbound.ignav_id}-${picked.inbound.ignav_id}`;
      setAiRecommendation({ rowKey, explanation: data.explanation });
    } catch {
    } finally {
      setRecommending(false);
    }
  }

  const todayIso = localDateToIso(new Date());
  const MAX_SELECTABLE_DAYS = 5; // igual al MAX_DATE_RANGE_DAYS del backend (lib/live-engine.ts)

  function syncOutboundRangeToDays(from: string, to: string) {
    const days = datesBetween(from, to).slice(0, MAX_SELECTABLE_DAYS);
    if (days.length > 0) setOutboundSelectedDays(days);
  }
  function syncInboundRangeToDays(from: string, to: string) {
    const days = datesBetween(from, to).slice(0, MAX_SELECTABLE_DAYS);
    if (days.length > 0) setInboundSelectedDays(days);
  }

  function toggleOutboundDay(date: string) {
    setOutboundSelectedDays((prev) => {
      const next = prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date];
      if (next.length === 0) return prev; // no permitir quedarse sin ningun dia
      if (next.length > MAX_SELECTABLE_DAYS) return prev;
      const sorted = [...next].sort();
      setOutboundDateFrom(sorted[0]);
      setOutboundDateTo(sorted[sorted.length - 1]);
      return next;
    });
  }

  function toggleInboundDay(date: string) {
    setInboundSelectedDays((prev) => {
      const next = prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date];
      if (next.length === 0) return prev;
      if (next.length > MAX_SELECTABLE_DAYS) return prev;
      const sorted = [...next].sort();
      setInboundDateFrom(sorted[0]);
      setInboundDateTo(sorted[sorted.length - 1]);
      return next;
    });
  }

  useEffect(() => {
    if (outboundNotBeforeHour === '' && outboundNotAfterHour === '') return;
    setOutboundDayHours((prev) => {
      const next: Record<string, DayHours> = { ...prev };
      for (const d of outboundSelectedDays) {
        const current = next[d] ?? {};
        next[d] = {
          before: current.before ?? (outboundNotBeforeHour === '' ? undefined : Number(outboundNotBeforeHour)),
          after: current.after ?? (outboundNotAfterHour === '' ? undefined : Number(outboundNotAfterHour))
        };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outboundNotBeforeHour, outboundNotAfterHour]);

  useEffect(() => {
    if (inboundNotBeforeHour === '' && inboundNotAfterHour === '') return;
    setInboundDayHours((prev) => {
      const next: Record<string, DayHours> = { ...prev };
      for (const d of inboundSelectedDays) {
        const current = next[d] ?? {};
        next[d] = {
          before: current.before ?? (inboundNotBeforeHour === '' ? undefined : Number(inboundNotBeforeHour)),
          after: current.after ?? (inboundNotAfterHour === '' ? undefined : Number(inboundNotAfterHour))
        };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboundNotBeforeHour, inboundNotAfterHour]);

  function changeOutboundDayHour(date: string, field: 'before' | 'after', value: number | undefined) {
    setOutboundDayHours((prev) => ({ ...prev, [date]: { ...prev[date], [field]: value } }));
  }
  function changeInboundDayHour(date: string, field: 'before' | 'after', value: number | undefined) {
    setInboundDayHours((prev) => ({ ...prev, [date]: { ...prev[date], [field]: value } }));
  }

  async function handleSearch() {
    await runSearch();
  }

  async function handleSurpriseMe() {
    if (originIatas.length === 0) {
      setError('Elige al menos un origen antes de pulsar "Sorprendeme".');
      return;
    }
    const basePool = filteredRealDestinations.length > 0 ? filteredRealDestinations : realDestinations;
    const visited = getVisitedDestinations();
    const pool = basePool.filter((d) => !visited.includes(d.dest_iata));
    if (pool.length === 0) {
      setError(
        'Todavia no hay destinos reales cargados para tus origenes (o la cache de Aena esta vacia para ellos), o ya has marcado todos como visitados. Prueba con otro origen o espera un momento.'
      );
      return;
    }
    const maxDestinations = Math.max(1, Math.floor(6 / originIatas.length));
    setError(null);
    setSurpriseExplanation(null);
    setSurprisePicking(true);

    let iatas: string[];
    try {
      const res = await fetch('/api/ai-surprise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originLabels,
          outboundDateFrom,
          outboundDateTo,
          inboundDateFrom,
          inboundDateTo,
          maxDestinations,
          realDestinations: pool.map((d) => ({ dest_iata: d.dest_iata, dest_name: d.dest_name, country: d.country }))
        })
      });
      if (!res.ok) throw new Error('IA no disponible');
      const ai = await res.json();
      if (!ai.destinationIatas?.length) throw new Error('Sin destinos validos de la IA');
      iatas = ai.destinationIatas;
      setSurpriseExplanation(typeof ai.explanation === 'string' ? ai.explanation : null);
    } catch {
      iatas = [...pool].sort(() => Math.random() - 0.5).slice(0, maxDestinations).map((d) => d.dest_iata);
      setSurpriseExplanation(null);
    } finally {
      setSurprisePicking(false);
    }

    setSelectedDestIatas(iatas);
    setSortBy('price');
    await runSearch(iatas, 'price');
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
      excludeIatasText,
      airlinesIncludeText,
      airlinesExcludeText
    };
  }

  async function handleShare() {
    const url = buildShareUrl(currentShareFilters());
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Tiriti Travel - busqueda', url });
        return;
      } catch {
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

  function handleShareWhatsApp() {
    const url = buildShareUrl(currentShareFilters());
    const text = `Mira esta busqueda de vuelos en Tiriti Travel: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  function handleRestoreFromHistory(url: string) {
    const [, search] = url.split('?');
    if (!search) return;
    const parsed = parseShareParams(`?${search}`);
    if (parsed.originIatas) setOriginIatas(parsed.originIatas);
    if (parsed.selectedDestIatas) setSelectedDestIatas(parsed.selectedDestIatas);
    if (parsed.outboundDateFrom) setOutboundDateFrom(parsed.outboundDateFrom);
    if (parsed.outboundDateTo) setOutboundDateTo(parsed.outboundDateTo);
    if (parsed.inboundDateFrom) setInboundDateFrom(parsed.inboundDateFrom);
    if (parsed.inboundDateTo) setInboundDateTo(parsed.inboundDateTo);
    if (parsed.outboundDateFrom || parsed.outboundDateTo) {
      syncOutboundRangeToDays(parsed.outboundDateFrom ?? outboundDateFrom, parsed.outboundDateTo ?? outboundDateTo);
    }
    if (parsed.inboundDateFrom || parsed.inboundDateTo) {
      syncInboundRangeToDays(parsed.inboundDateFrom ?? inboundDateFrom, parsed.inboundDateTo ?? inboundDateTo);
    }
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
    if (parsed.airlinesIncludeText !== undefined) setAirlinesIncludeText(parsed.airlinesIncludeText);
    if (parsed.airlinesExcludeText !== undefined) setAirlinesExcludeText(parsed.airlinesExcludeText);
    setLiveResults(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const originsList = meta?.origins ?? [{ iata: 'ALC', city: 'Alicante' }];

  function renderSortSelect(idSuffix: string) {
    return (
      <select
        id={`sort-select-${idSuffix}`}
        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100"
        value={sortBy}
        onChange={(e) => handleReSort(e.target.value as any)}
      >
        <option value="checkout_time">Hora salida hotel</option>
        <option value="price">Precio total</option>
        <option value="duration">Duracion total</option>
      </select>
    );
  }

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

          <div className="bg-gradient-to-r from-indigo via-violet-500 to-fuchsia-500 rounded-2xl shadow-lg shadow-indigo-500/20 overflow-hidden">
            <button
              type="button"
              onClick={handleSurpriseMe}
              disabled={loading || surprisePicking || originIatas.length === 0}
              className="w-full flex items-center justify-between gap-4 text-white px-5 py-4 md:px-8 md:py-5 transition-all hover:brightness-110 disabled:opacity-40"
            >
              <div className="text-left min-w-0">
                <p className="font-display text-lg md:text-xl">¿No sabes a donde ir?</p>
                <p className="text-xs md:text-sm text-white/80 truncate">
                  La IA estudia tus destinos reales y elige los mas favorables para tus fechas, ordenados por precio.
                </p>
              </div>
              <span className="flex items-center gap-2 bg-white/15 rounded-full pl-4 pr-5 py-3 font-semibold shrink-0 whitespace-nowrap">
                <IconSparkles className="w-5 h-5" />
                {surprisePicking ? 'Pensando...' : loading ? 'Buscando...' : 'Sorprendeme'}
              </span>
            </button>
            {surpriseExplanation && (
              <p className="text-xs text-white/90 bg-black/10 px-5 py-2.5 md:px-8 flex items-center gap-1.5">
                <IconSparkles className="w-3.5 h-3.5 shrink-0" />
                {surpriseExplanation}
              </p>
            )}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 -mt-2">
            Para usar "Sorpréndeme" solo hace falta tener elegido al menos un origen (más abajo). Usa las fechas, horas y
            pasajeros que tengas puestos en el formulario en ese momento -- si no has tocado nada, se usan los valores por
            defecto.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
            <div className="space-y-6 min-w-0">
              <section id="search-form" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 md:p-6 space-y-6 scroll-mt-4">
                <div className="flex items-center gap-2">
                  <IconSliders className="w-5 h-5 text-indigo" />
                  <h2 className="text-base font-semibold text-ink dark:text-slate-100">Quien, cuando y a donde</h2>
                </div>

                <div className="ai-glow-border rounded-xl">
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-4 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <IconSparkles className="w-4 h-4 text-indigo" />
                      <p className="text-sm font-semibold text-ink dark:text-slate-100">Describe tu viaje con tus palabras</p>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Ej.: "vuelo a Polonia desde Alicante o Valencia, salida el 4 despues de las 18h o si no el 5 a partir de las 8h,
                      regreso no antes de las 12h". Revisa siempre como se ha interpretado antes de buscar.
                    </p>
                    <textarea
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm text-ink dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo/40 focus:border-indigo/60"
                      rows={2}
                      value={nlpText}
                      onChange={(e) => setNlpText(e.target.value)}
                      placeholder="Describe tu busqueda en una frase..."
                    />
                    <button
                      onClick={handleInterpret}
                      disabled={nlpInterpreting || !nlpText.trim()}
                      className="flex items-center gap-1.5 bg-indigo hover:bg-indigo-dark text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <IconSparkles className="w-4 h-4" />
                      {nlpInterpreting ? 'Interpretando...' : 'Interpretar y precargar filtros'}
                    </button>
                    {nlpExplanation && (
                      <div className="text-indigo-dark dark:text-indigo-light text-sm bg-indigo-pale dark:bg-indigo-950 border border-indigo/20 rounded-lg p-3 space-y-2">
                        <div className="flex gap-2">
                          <IconSparkles className="w-4 h-4 shrink-0 mt-0.5" />
                          <p>{nlpExplanation}</p>
                        </div>
                        <button
                          onClick={handleSearch}
                          disabled={loading || originIatas.length === 0 || selectedDestIatas.length === 0}
                          className="bg-indigo hover:bg-indigo-dark text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {loading ? 'Buscando...' : 'Buscar con esta interpretacion'}
                        </button>
                      </div>
                    )}
                    {nlpWarnings.length > 0 && (
                      <div className="text-amber-800 dark:text-amber-200 text-sm bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                        <p className="font-medium mb-1">
                          {nlpUsedAI ? 'Revisa la interpretacion:' : 'Revisa la interpretacion (analisis local, sin IA):'}
                        </p>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {nlpWarnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Origenes (puedes elegir varios)</p>
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
                      Destinos ({filteredRealDestinations.length} vuelos directos reales desde tus origenes -- puedes elegir varios)
                    </p>
                  </div>
                  {realDestError && (
                    <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded p-2 mb-2">
                      No se pudo cargar el listado: {realDestError}
                    </p>
                  )}
                  {selectedDestIatas.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5 border border-indigo/30 rounded-xl p-2 bg-indigo-pale dark:bg-indigo-950">
                      {selectedDestIatas.map((iata) => {
                        const found = realDestinations.find((d) => d.dest_iata === iata);
                        return (
                          <button
                            key={iata}
                            type="button"
                            onClick={() => setSelectedDestIatas((prev) => prev.filter((i) => i !== iata))}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-indigo text-white flex items-center gap-1"
                            title="Quitar de la seleccion"
                          >
                            {found?.dest_name ?? iata} ({iata})
                            <IconX className="w-3 h-3" />
                          </button>
                        );
                      })}
                    </div>
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

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
                        Dias de ida (toca uno o varios, hasta {MAX_SELECTABLE_DAYS})
                      </p>
                      <DayPicker selectedDays={outboundSelectedDays} onToggleDay={toggleOutboundDay} minDate={todayIso} />
                      <div className="mt-2">
                        <DayHoursList selectedDays={outboundSelectedDays} dayHours={outboundDayHours} onChangeHour={changeOutboundDayHour} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
                        Dias de vuelta (toca uno o varios, hasta {MAX_SELECTABLE_DAYS})
                      </p>
                      <DayPicker
                        selectedDays={inboundSelectedDays}
                        onToggleDay={toggleInboundDay}
                        minDate={outboundSelectedDays[0] ?? todayIso}
                      />
                      <div className="mt-2">
                        <DayHoursList selectedDays={inboundSelectedDays} dayHours={inboundDayHours} onChangeHour={changeInboundDayHour} />
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                    Las horas son opcionales -- si las dejas vacias, se usa la franja general del panel de "Horarios" en el
                    lateral (o ninguna restriccion si tampoco esta puesta ahi).
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 min-w-0">
                    Adultos
                    <input
                      type="number"
                      min={1}
                      className="mt-1 w-full min-w-0 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100"
                      value={adults}
                      onChange={(e) => setAdults(Number(e.target.value))}
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 min-w-0">
                    Ninos
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full min-w-0 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100"
                      value={children}
                      onChange={(e) => setChildren(Number(e.target.value))}
                    />
                  </label>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Combinaciones origen x destino: <strong className="text-ink dark:text-slate-100">{combos}</strong> de{' '}
                  <strong className="text-ink dark:text-slate-100">{comboLimit}</strong> permitidas ahora mismo
                  {combos > comboLimit && <span className="text-red-500 dark:text-red-400"> (reduce la seleccion)</span>}
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  Maximo 5 dias por tramo. El maximo de combinaciones ({comboLimit} ahora mismo) varia segun cuanta cuota de
                  Ignav te quede: hasta 10 si te queda mas de la mitad, bajando a 3 si queda poca -- mira "Cuota de Ignav"
                  en el panel de herramientas para ver cuanto te queda antes de decidir cuantos origenes/destinos elegir.
                </p>

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={handleSearch}
                    disabled={loading || originIatas.length === 0 || selectedDestIatas.length === 0}
                    className="bg-indigo hover:bg-indigo-dark text-white font-semibold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-40"
                  >
                    {loading ? 'Buscando...' : 'Buscar vuelos'}
                  </button>
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-indigo px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo/40 transition-colors"
                  >
                    <IconShare className="w-4 h-4" />
                    Compartir esta busqueda
                  </button>
                  <button
                    onClick={handleShareWhatsApp}
                    aria-label="Compartir por WhatsApp"
                    className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-emerald-400 transition-colors"
                  >
                    <IconWhatsApp className="w-4 h-4" />
                  </button>
                  {shareMessage && <span className="text-xs text-emerald-600 dark:text-emerald-400">{shareMessage}</span>}
                </div>

                <p className="min-h-[1rem] text-xs text-slate-500 dark:text-slate-400 truncate">
                  {loading ? progressMessage : ''}
                </p>

                {error && <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>}
              </section>

              {liveResults && (
                <>
                  {isOfflineResult && (
                    <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                      Sin conexion -- mostrando tu ultima busqueda guardada en el telefono, puede no estar actualizada.
                    </p>
                  )}
                  <ResultsSection
                  liveResults={liveResults}
                  bookingLinks={bookingLinks}
                  loadingLinks={loadingLinks}
                  onShowLinks={handleShowLinks}
                  aiRecommendation={aiRecommendation}
                  recommending={recommending}
                  warnings={warnings}
                  sortSelect={renderSortSelect('results')}
                  paxCount={adults + children}
                  childrenCount={children}
                />
                </>
              )}
            </div>

            <aside className="space-y-4 lg:sticky lg:top-6">
              <details className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5">
                <summary className="flex items-center justify-between cursor-pointer list-none mb-1">
                  <h2 className="text-sm font-semibold text-ink dark:text-slate-100">Filtros y ajustes</h2>
                  <IconChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform group-open:rotate-180" />
                </summary>
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
                    {renderSortSelect('sidebar')}
                  </label>
                </FilterAccordion>

                <FilterAccordion title="Extras" defaultOpen>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <input type="checkbox" checked={requireCabinBaggage} onChange={(e) => setRequireCabinBaggage(e.target.checked)} />
                    Exigir equipaje de mano
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <input type="checkbox" checked={allowOpenJaw} onChange={(e) => setAllowOpenJaw(e.target.checked)} />
                    Permitir llegar y salir por aeropuertos distintos (open-jaw)
                  </label>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 -mt-2">
                    Ejemplo de open-jaw: llegar a Londres-Gatwick y volver desde Londres-Stansted -- misma ciudad, aeropuerto
                    distinto en cada sentido. Util cuando eso sale mas barato o encaja mejor con los horarios.
                  </p>
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
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Aerolineas preferidas
                      <input
                        type="text"
                        placeholder="Ej: Ryanair, Vueling, FR"
                        className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                        value={airlinesIncludeText}
                        onChange={(e) => setAirlinesIncludeText(e.target.value)}
                      />
                    </label>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                      Nombre o codigo de 2-3 letras, separados por coma. Vacio = todas.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Aerolineas a evitar
                      <input
                        type="text"
                        placeholder="Ej: Wizz Air, W6"
                        className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                        value={airlinesExcludeText}
                        onChange={(e) => setAirlinesExcludeText(e.target.value)}
                      />
                    </label>
                  </div>
                </FilterAccordion>
              </details>

              <ExploreDestinations
                originIatas={originIatas.length > 0 ? originIatas : ['ALC']}
                onUseDestination={(iata) => setSelectedDestIatas((prev) => (prev.includes(iata) ? prev : [...prev, iata]))}
              />

              <SearchHistoryPanel onRestore={handleRestoreFromHistory} />

              <ToolsPanel
                originIatas={originIatas}
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
