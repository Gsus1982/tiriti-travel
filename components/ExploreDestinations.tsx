'use client';

import { useEffect, useState } from 'react';
import { IconSparkles, IconMapPin, IconChevronDown } from './Icons';
import { getVisitedDestinations, toggleVisitedDestination } from '@/lib/visited-destinations';

type ExploreDestination = {
  destinationIata: string;
  price: number;
  currency: string;
  departureAt: string | null;
  transfers: number;
  verifiedName: string | null;
};

export default function ExploreDestinations({
  originIatas,
  onUseDestination
}: {
  originIatas: string[];
  onUseDestination: (iata: string) => void;
}) {
  const [origin, setOrigin] = useState(originIatas[0] ?? '');
  const [destinations, setDestinations] = useState<ExploreDestination[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [visited, setVisited] = useState<string[]>([]);
  const [showVisited, setShowVisited] = useState(false);

  useEffect(() => {
    setVisited(getVisitedDestinations());
  }, []);

  function markVisited(iata: string) {
    setVisited(toggleVisitedDestination(iata));
  }

  function useDestination(d: ExploreDestination) {
    onUseDestination(d.destinationIata);
    setJustAdded(d.verifiedName ?? d.destinationIata);
    // FIX (reportado: "el enlace no funciona"): antes esto anadia el destino EN
    // SILENCIO -- sin confirmacion visible ni desplazamiento, parecia que el boton no
    // hacia nada porque el resultado (el destino marcado mas abajo, en el formulario)
    // quedaba fuera de la vista. Ahora se confirma con un texto y se baja hasta el
    // formulario para que se vea el efecto de verdad.
    document.getElementById('search-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => setJustAdded(null), 4000);
  }

  async function explore() {
    const o = origin || originIatas[0];
    if (!o) {
      setError('Elige un origen primero.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: o })
      });
      if (res.status === 503) {
        setUnavailable(true);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
      setDestinations(data.destinations ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (unavailable) {
    return (
      <details className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6">
        <summary className="flex items-center justify-between cursor-pointer list-none mb-1">
          <span className="flex items-center gap-2">
            <IconSparkles className="w-4 h-4 text-indigo" />
            <h2 className="text-base font-semibold text-ink dark:text-slate-100">Explorar destinos (gratis)</h2>
          </span>
          <IconChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform group-open:rotate-180" />
        </summary>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          Todavia no esta configurado. Registrate gratis en{' '}
          <a href="https://www.travelpayouts.com" target="_blank" rel="noreferrer" className="text-indigo underline">
            travelpayouts.com
          </a>{' '}
          (no piden tarjeta) y añade tu token como <code>TRAVELPAYOUTS_TOKEN</code> en Vercel.
        </p>
      </details>
    );
  }

  return (
    <details className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6">
      <summary className="flex items-center justify-between cursor-pointer list-none mb-1">
        <span className="flex items-center gap-2">
          <IconSparkles className="w-4 h-4 text-indigo" />
          <h2 className="text-base font-semibold text-ink dark:text-slate-100">Explorar destinos (gratis)</h2>
        </span>
        <IconChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-3 mt-2">
        Precios orientativos de otros viajeros (no en tiempo real, no gastan tu cuota de Ignav) para inspirarte antes de
        buscar de verdad.
      </p>
      <div className="flex gap-2 items-end flex-wrap mb-3">
        <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Origen
          <select
            className="mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-lg p-2 text-sm text-ink dark:text-slate-100"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
          >
            {originIatas.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={explore}
          disabled={loading}
          className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-ink dark:text-slate-100 text-sm font-medium px-4 py-2 rounded-lg transition-colors border border-slate-100 dark:border-slate-800 disabled:opacity-50"
        >
          {loading ? 'Explorando...' : 'Explorar'}
        </button>
      </div>
      {error && <p className="text-red-500 dark:text-red-400 text-xs mb-2">{error}</p>}
      {justAdded && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">
          Añadido "{justAdded}" a tu busqueda -- revisalo en el formulario de arriba.
        </p>
      )}
      {destinations && destinations.length === 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500">Sin datos para este origen todavia.</p>
      )}
      {destinations && destinations.length > 0 && (
        <>
          {visited.length > 0 && (
            <button
              onClick={() => setShowVisited((v) => !v)}
              className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 mb-2 underline decoration-dotted"
            >
              {showVisited ? 'Ocultar' : 'Mostrar'} destinos ya visitados ({visited.length})
            </button>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {destinations
              .filter((d) => showVisited || !visited.includes(d.destinationIata))
              .map((d) => {
                const isVisited = visited.includes(d.destinationIata);
                return (
                  <div
                    key={d.destinationIata}
                    className={`rounded-lg border p-2.5 text-xs flex flex-col gap-1 ${
                      isVisited
                        ? 'border-slate-100 dark:border-slate-800 opacity-50'
                        : 'border-slate-100 dark:border-slate-800'
                    }`}
                  >
                    <p className="font-medium text-ink dark:text-slate-100 truncate">{d.verifiedName ?? d.destinationIata}</p>
                    <p className="text-slate-500 dark:text-slate-400">
                      desde {d.price.toFixed(0)} {d.currency}
                    </p>
                    {d.verifiedName ? (
                      <button
                        onClick={() => useDestination(d)}
                        className="mt-1 flex items-center gap-1 text-indigo hover:text-indigo-dark text-[11px] font-medium"
                      >
                        <IconMapPin className="w-3 h-3" />
                        Buscar este
                      </button>
                    ) : (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">Sin verificar vuelo directo</p>
                    )}
                    <button
                      onClick={() => markVisited(d.destinationIata)}
                      className="text-[10px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-left"
                    >
                      {isVisited ? 'Desmarcar visitado' : 'Ya he estado aqui'}
                    </button>
                  </div>
                );
              })}
          </div>
        </>
      )}
    </details>
  );
}
