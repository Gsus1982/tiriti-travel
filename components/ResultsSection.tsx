'use client';

import { useMemo, useState } from 'react';
import type { LiveItinerary } from '@/lib/live-engine';
import FlightResultCard from './FlightResultCard';
import { IconTicket, IconSparkles } from './Icons';

type BookingLinksState = Record<
  string,
  { provider_name: string; url: string; price?: { amount: number; currency: string } }[]
>;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(fromIso: string, toIso: string): string {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  const totalMinutes = Math.round(ms / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

function rowKeyOf(r: LiveItinerary): string {
  return `${r.outbound.ignav_id}-${r.inbound.ignav_id}`;
}

function findCheaperAlternative(all: LiveItinerary[], current: LiveItinerary): LiveItinerary | null {
  const currentCheckout = new Date(current.hotelCheckoutAt).getTime();
  let best: LiveItinerary | null = null;
  for (const candidate of all) {
    if (candidate === current) continue;
    if (candidate.totalPrice > current.totalPrice - 15) continue;
    const candidateCheckout = new Date(candidate.hotelCheckoutAt).getTime();
    const earlierByHours = (currentCheckout - candidateCheckout) / (1000 * 60 * 60);
    if (earlierByHours > 3) continue;
    if (!best || candidate.totalPrice < best.totalPrice) best = candidate;
  }
  return best;
}

const MAX_COMPARE = 3;

export default function ResultsSection({
  liveResults,
  bookingLinks,
  loadingLinks,
  onShowLinks,
  aiRecommendation,
  recommending,
  warnings,
  sortSelect
}: {
  liveResults: LiveItinerary[];
  bookingLinks: BookingLinksState;
  loadingLinks: string | null;
  onShowLinks: (rowKey: string, ignavId: string) => void;
  aiRecommendation: { rowKey: string; explanation: string } | null;
  recommending: boolean;
  warnings: string[];
  sortSelect: React.ReactNode;
}) {
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [compareKeys, setCompareKeys] = useState<string[]>([]);
  const [limitNotice, setLimitNotice] = useState(false);

  function toggleCompare(rowKey: string) {
    setCompareKeys((prev) => {
      if (prev.includes(rowKey)) {
        setLimitNotice(false);
        return prev.filter((k) => k !== rowKey);
      }
      if (prev.length >= MAX_COMPARE) {
        setLimitNotice(true);
        setTimeout(() => setLimitNotice(false), 3000);
        return prev;
      }
      return [...prev, rowKey];
    });
  }

  const compareItems = useMemo(
    () => liveResults.filter((r) => compareKeys.includes(rowKeyOf(r))),
    [liveResults, compareKeys]
  );

  const bestCompare = useMemo(() => {
    if (compareItems.length === 0) return null;
    const durations = compareItems.map((r) => new Date(r.inbound.arrival_at).getTime() - new Date(r.outbound.departure_at).getTime());
    return {
      minPrice: Math.min(...compareItems.map((r) => r.totalPrice)),
      minDuration: Math.min(...durations),
      earliestCheckout: Math.min(...compareItems.map((r) => new Date(r.hotelCheckoutAt).getTime()))
    };
  }, [compareItems]);

  const cheaperAltByKey = useMemo(() => {
    const map = new Map<string, LiveItinerary | null>();
    for (const r of liveResults) {
      map.set(rowKeyOf(r), findCheaperAlternative(liveResults, r));
    }
    return map;
  }, [liveResults]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <IconTicket className="w-5 h-5 text-indigo" />
          <div>
            <h2 className="font-display text-lg text-ink dark:text-slate-100">Vuelos disponibles</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{liveResults.length} resultados</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-medium">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 transition-colors ${
                viewMode === 'cards' ? 'bg-indigo text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400'
              }`}
            >
              Tarjetas
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 transition-colors ${
                viewMode === 'list' ? 'bg-indigo text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400'
              }`}
            >
              Lista
            </button>
          </div>
          <div className="w-44">{sortSelect}</div>
        </div>
      </div>

      {liveResults.length === 0 && (
        <div className="text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-8 text-center space-y-1">
          <p className="text-2xl">🧭✈️🤷</p>
          <p className="font-medium text-ink dark:text-slate-100">Ni un vuelo directo por aqui, colega.</p>
          <p>
            Prueba a mover las fechas un dia, soltar algun filtro de aerolinea o de equipaje, o abrir el open-jaw. El cielo es
            grande y seguro que hay una combinacion que si cuadra.
          </p>
        </div>
      )}

      {recommending && (
        <p className="text-xs text-indigo flex items-center gap-1.5">
          <IconSparkles className="w-3.5 h-3.5 animate-pulse" />
          La IA esta analizando los resultados para recomendarte uno...
        </p>
      )}
      {aiRecommendation && (
        <div className="bg-indigo-pale dark:bg-indigo-950 border border-indigo/30 rounded-2xl p-4 flex gap-2.5">
          <IconSparkles className="w-5 h-5 text-indigo shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-indigo-dark dark:text-indigo-light">Recomendacion de la IA</p>
            <p className="text-sm text-ink dark:text-slate-200 mt-0.5">{aiRecommendation.explanation}</p>
          </div>
        </div>
      )}

      {limitNotice && (
        <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          Ya tienes {MAX_COMPARE} opciones en comparacion (el maximo para que la tabla siga siendo legible). Quita alguna
          antes de anadir otra.
        </p>
      )}

      {compareItems.length >= 2 && bestCompare && (
        <div className="bg-white dark:bg-slate-900 border border-indigo/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink dark:text-slate-100">
              Comparando {compareItems.length} opcion{compareItems.length > 1 ? 'es' : ''}
              <span className="ml-2 text-xs font-normal text-slate-400 hidden sm:inline">(en verde, la mejor de cada fila)</span>
            </p>
            <button
              type="button"
              onClick={() => setCompareKeys([])}
              className="text-xs text-slate-400 hover:text-indigo underline"
            >
              Limpiar comparacion
            </button>
          </div>

          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="text-left text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                  <th className="py-1.5 pr-3 font-medium">Ruta</th>
                  <th className="py-1.5 pr-3 font-medium">Precio total</th>
                  <th className="py-1.5 pr-3 font-medium">Salida ida</th>
                  <th className="py-1.5 pr-3 font-medium">Llegada ida</th>
                  <th className="py-1.5 pr-3 font-medium">Salida vuelta</th>
                  <th className="py-1.5 pr-3 font-medium">Llegada vuelta</th>
                  <th className="py-1.5 pr-3 font-medium">Duracion total</th>
                  <th className="py-1.5 pr-3 font-medium">Salida hotel</th>
                  <th className="py-1.5 pr-3 font-medium">Aerolinea ida</th>
                  <th className="py-1.5 pr-3 font-medium">Aerolinea vuelta</th>
                  <th className="py-1.5 pr-3 font-medium">Open-jaw</th>
                  <th className="py-1.5 pr-3 font-medium">Fuente</th>
                </tr>
              </thead>
              <tbody>
                {compareItems.map((r) => {
                  const duration = new Date(r.inbound.arrival_at).getTime() - new Date(r.outbound.departure_at).getTime();
                  const checkoutTime = new Date(r.hotelCheckoutAt).getTime();
                  return (
                    <tr key={rowKeyOf(r)} className="border-b border-slate-50 dark:border-slate-800/60 text-slate-700 dark:text-slate-300">
                      <td className="py-1.5 pr-3 font-medium text-ink dark:text-slate-100">
                        {r.originIata} → {r.destinationName}
                      </td>
                      <td className={`py-1.5 pr-3 font-semibold ${r.totalPrice === bestCompare.minPrice ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink dark:text-slate-100'}`}>
                        {r.totalPrice.toFixed(2)} {r.currency}
                      </td>
                      <td className="py-1.5 pr-3">{formatDateTime(r.outbound.departure_at)}</td>
                      <td className="py-1.5 pr-3">{formatDateTime(r.outbound.arrival_at)}</td>
                      <td className="py-1.5 pr-3">{formatDateTime(r.inbound.departure_at)}</td>
                      <td className="py-1.5 pr-3">{formatDateTime(r.inbound.arrival_at)}</td>
                      <td className={`py-1.5 pr-3 ${duration === bestCompare.minDuration ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}`}>
                        {formatDuration(r.outbound.departure_at, r.inbound.arrival_at)}
                      </td>
                      <td className={`py-1.5 pr-3 ${checkoutTime === bestCompare.earliestCheckout ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}`}>
                        {formatDateTime(r.hotelCheckoutAt)}
                      </td>
                      <td className="py-1.5 pr-3">{r.outbound.airline}</td>
                      <td className="py-1.5 pr-3">{r.inbound.airline}</td>
                      <td className="py-1.5 pr-3">{r.isOpenJaw ? 'Si' : 'No'}</td>
                      <td className="py-1.5 pr-3">{r.source === 'skyscanner' ? 'Sky Scrapper' : 'Ignav'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden space-y-2">
            {compareItems.map((r) => {
              const duration = new Date(r.inbound.arrival_at).getTime() - new Date(r.outbound.departure_at).getTime();
              const checkoutTime = new Date(r.hotelCheckoutAt).getTime();
              return (
                <div key={rowKeyOf(r)} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-xs space-y-1">
                  <p className="font-semibold text-ink dark:text-slate-100">
                    {r.originIata} → {r.destinationName}
                  </p>
                  <p className={r.totalPrice === bestCompare.minPrice ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}>
                    Precio: {r.totalPrice.toFixed(2)} {r.currency}
                  </p>
                  <p>Ida: {formatDateTime(r.outbound.departure_at)} → {formatDateTime(r.outbound.arrival_at)} ({r.outbound.airline})</p>
                  <p>Vuelta: {formatDateTime(r.inbound.departure_at)} → {formatDateTime(r.inbound.arrival_at)} ({r.inbound.airline})</p>
                  <p className={duration === bestCompare.minDuration ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}>
                    Duracion total: {formatDuration(r.outbound.departure_at, r.inbound.arrival_at)}
                  </p>
                  <p className={checkoutTime === bestCompare.earliestCheckout ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : ''}>
                    Salida hotel: {formatDateTime(r.hotelCheckoutAt)}
                  </p>
                  <p className="text-slate-400 dark:text-slate-500">
                    {r.isOpenJaw ? 'Open-jaw' : 'Mismo aeropuerto'} · {r.source === 'skyscanner' ? 'Sky Scrapper' : 'Ignav'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={viewMode === 'cards' ? 'space-y-3' : 'space-y-1.5'}>
        {liveResults.map((r) => {
          const rowKey = rowKeyOf(r);
          return (
            <FlightResultCard
              key={rowKey}
              result={r}
              bookingLinks={bookingLinks[rowKey]}
              loadingLinks={loadingLinks === rowKey}
              onShowLinks={() => onShowLinks(rowKey, r.outbound.ignav_id)}
              isRecommended={aiRecommendation?.rowKey === rowKey}
              compact={viewMode === 'list'}
              isComparing={compareKeys.includes(rowKey)}
              onToggleCompare={() => toggleCompare(rowKey)}
              cheaperAlternative={cheaperAltByKey.get(rowKey) ?? null}
            />
          );
        })}
      </div>

      {warnings.length > 0 && (
        <details className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200">
          <summary className="font-medium cursor-pointer select-none">
            Avisos de la busqueda ({warnings.length}) -- toca para ver
          </summary>
          <ul className="list-disc pl-5 space-y-0.5 mt-2">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
