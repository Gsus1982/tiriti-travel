'use client';

import { useMemo, useState } from 'react';
import type { LiveItinerary } from '@/lib/live-engine';
import FlightResultCard from './FlightResultCard';
import { IconTicket, IconSparkles } from './Icons';

type BookingLink = { provider_name: string; url: string; price?: { amount: number; currency: string } };

function rowKeyOf(r: LiveItinerary): string {
  return `${r.outbound.ignav_id}-${r.inbound.ignav_id}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function computeCheaperNotes(results: LiveItinerary[]): Record<string, string> {
  const notes: Record<string, string> = {};
  for (const r of results) {
    let best: { priceDiff: number; hoursEarlier: number } | null = null;
    for (const c of results) {
      if (c === r) continue;
      const priceDiff = r.totalPrice - c.totalPrice;
      if (priceDiff < 15) continue;
      const rCheckout = new Date(r.hotelCheckoutAt).getTime();
      const cCheckout = new Date(c.hotelCheckoutAt).getTime();
      const hoursEarlier = (rCheckout - cCheckout) / 3600000;
      if (hoursEarlier > 3) continue;
      if (!best || priceDiff > best.priceDiff) best = { priceDiff, hoursEarlier };
    }
    if (best) {
      const earlierText =
        best.hoursEarlier > 0.25 ? ` (saliendo del hotel ${Math.round(best.hoursEarlier)}h antes)` : ' (misma hora de salida del hotel, aprox.)';
      notes[rowKeyOf(r)] = `Hay una opcion ${best.priceDiff.toFixed(0)} EUR mas barata${earlierText}.`;
    }
  }
  return notes;
}

export default function ResultsSection({
  liveResults,
  aiRecommendation,
  recommending,
  sortSelect,
  bookingLinks,
  loadingLinks,
  onShowLinks
}: {
  liveResults: LiveItinerary[];
  aiRecommendation: { rowKey: string; explanation: string } | null;
  recommending: boolean;
  sortSelect: React.ReactNode;
  bookingLinks: Record<string, BookingLink[]>;
  loadingLinks: string | null;
  onShowLinks: (rowKey: string, ignavId: string) => void;
}) {
  const [compact, setCompact] = useState(false);
  const [compareKeys, setCompareKeys] = useState<string[]>([]);

  const cheaperNotes = useMemo(() => computeCheaperNotes(liveResults), [liveResults]);

  function toggleCompare(rowKey: string) {
    setCompareKeys((prev) => {
      if (prev.includes(rowKey)) return prev.filter((k) => k !== rowKey);
      if (prev.length >= 3) return prev;
      return [...prev, rowKey];
    });
  }

  const compareResults = liveResults.filter((r) => compareKeys.includes(rowKeyOf(r)));

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
        <div className="flex items-center gap-2">
          {liveResults.length > 0 && (
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
              <button
                onClick={() => setCompact(false)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  !compact ? 'bg-indigo text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400'
                }`}
              >
                Tarjetas
              </button>
              <button
                onClick={() => setCompact(true)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  compact ? 'bg-indigo text-white' : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400'
                }`}
              >
                Lista
              </button>
            </div>
          )}
          <div className="w-44">{sortSelect}</div>
        </div>
      </div>

      {liveResults.length === 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-8 text-center space-y-2">
          <p className="text-3xl">🧭✈️🌴</p>
          <p className="text-sm font-medium text-ink dark:text-slate-100">Por aqui no hay ruta directa todavia...</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            No hemos encontrado vuelos directos que cumplan tus filtros para estas fechas. Prueba a ampliar el rango de
            fechas, quitar algun filtro de horario, o dejate llevar y pulsa "Sorprendeme" con otro origen.
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

      {compareResults.length >= 2 && (
        <div className="bg-white dark:bg-slate-900 border border-indigo/30 rounded-2xl p-4 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink dark:text-slate-100">Comparando {compareResults.length} opciones</p>
            <button onClick={() => setCompareKeys([])} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              Limpiar
            </button>
          </div>
          <table className="w-full text-xs">
            <tbody>
              <tr className="text-left text-slate-400 dark:text-slate-500">
                <td className="py-1 pr-3 font-medium">Destino</td>
                {compareResults.map((r) => (
                  <td key={rowKeyOf(r)} className="py-1 px-3 font-semibold text-ink dark:text-slate-100">
                    {r.destinationGroupName}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-3 text-slate-400 dark:text-slate-500">Precio</td>
                {compareResults.map((r) => (
                  <td key={rowKeyOf(r)} className="py-1.5 px-3 font-semibold text-ink dark:text-slate-100">
                    {r.totalPrice.toFixed(2)} {r.currency}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-3 text-slate-400 dark:text-slate-500">Salida hotel</td>
                {compareResults.map((r) => (
                  <td key={rowKeyOf(r)} className="py-1.5 px-3 text-ink dark:text-slate-100">
                    {formatDateTime(r.hotelCheckoutAt)}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-3 text-slate-400 dark:text-slate-500">Aerolinea ida</td>
                {compareResults.map((r) => (
                  <td key={rowKeyOf(r)} className="py-1.5 px-3 text-ink dark:text-slate-100">
                    {r.outbound.airline}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-3 text-slate-400 dark:text-slate-500">Open-jaw</td>
                {compareResults.map((r) => (
                  <td key={rowKeyOf(r)} className="py-1.5 px-3 text-ink dark:text-slate-100">
                    {r.isOpenJaw ? 'Si' : 'No'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-3">
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
              compact={compact}
              compareSelected={compareKeys.includes(rowKey)}
              onToggleCompare={() => toggleCompare(rowKey)}
              cheaperAlternativeNote={cheaperNotes[rowKey] ?? null}
            />
          );
        })}
      </div>
    </section>
  );
}
