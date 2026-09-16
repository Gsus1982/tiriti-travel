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

  function toggleCompare(rowKey: string) {
    setCompareKeys((prev) => {
      if (prev.includes(rowKey)) return prev.filter((k) => k !== rowKey);
      if (prev.length >= 3) return prev;
      return [...prev, rowKey];
    });
  }

  const compareItems = useMemo(
    () => liveResults.filter((r) => compareKeys.includes(rowKeyOf(r))),
    [liveResults, compareKeys]
  );

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

      {compareItems.length >= 2 && (
        <div className="bg-white dark:bg-slate-900 border border-indigo/30 rounded-2xl p-4 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink dark:text-slate-100">
              Comparando {compareItems.length} opcion{compareItems.length > 1 ? 'es' : ''}
            </p>
            <button
              type="button"
              onClick={() => setCompareKeys([])}
              className="text-xs text-slate-400 hover:text-indigo underline"
            >
              Limpiar comparacion
            </button>
          </div>
          <table className="w-full text-xs min-w-[480px]">
            <thead>
              <tr className="text-left text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                <th className="py-1.5 pr-3 font-medium">Ruta</th>
                <th className="py-1.5 pr-3 font-medium">Precio total</th>
                <th className="py-1.5 pr-3 font-medium">Salida hotel</th>
                <th className="py-1.5 pr-3 font-medium">Aerolinea ida</th>
                <th className="py-1.5 pr-3 font-medium">Open-jaw</th>
              </tr>
            </thead>
            <tbody>
              {compareItems.map((r) => (
                <tr key={rowKeyOf(r)} className="border-b border-slate-50 dark:border-slate-800/60 text-slate-700 dark:text-slate-300">
                  <td className="py-1.5 pr-3">
                    {r.originIata} → {r.destinationName}
                  </td>
                  <td className="py-1.5 pr-3 font-semibold text-ink dark:text-slate-100">
                    {r.totalPrice.toFixed(2)} {r.currency}
                  </td>
                  <td className="py-1.5 pr-3">{formatDateTime(r.hotelCheckoutAt)}</td>
                  <td className="py-1.5 pr-3">{r.outbound.airline}</td>
                  <td className="py-1.5 pr-3">{r.isOpenJaw ? 'Si' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
