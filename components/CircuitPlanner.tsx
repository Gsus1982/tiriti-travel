'use client';

import { useState } from 'react';
import { IconMapPin, IconChevronDown } from './Icons';

type Leg = { toIata: string; date: string };
type LegResult = {
  fromIata: string;
  toIata: string;
  date: string;
  found: boolean;
  price: number | null;
  currency: string | null;
  airline: string | null;
  departureAt: string | null;
  arrivalAt: string | null;
  error?: string;
};

const MAX_LEGS = 5;

export default function CircuitPlanner({ originIatas, adults, children }: { originIatas: string[]; adults: number; children: number }) {
  const [origin, setOrigin] = useState(originIatas[0] ?? '');
  const [legs, setLegs] = useState<Leg[]>([{ toIata: '', date: '' }]);
  const [returnToOrigin, setReturnToOrigin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ legs: LegResult[]; totalPrice: number | null; currency: string | null } | null>(null);

  function addLeg() {
    if (legs.length >= MAX_LEGS - 1) return;
    setLegs((prev) => [...prev, { toIata: '', date: '' }]);
  }
  function removeLeg(i: number) {
    setLegs((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateLeg(i: number, field: 'toIata' | 'date', value: string) {
    setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: field === 'toIata' ? value.toUpperCase() : value } : l)));
  }

  async function search() {
    setError(null);
    if (!origin) {
      setError('Elige un origen.');
      return;
    }
    const cleanLegs = legs.filter((l) => l.toIata.trim().length === 3 && l.date);
    if (cleanLegs.length === 0) {
      setError('Añade al menos un tramo con destino (codigo IATA de 3 letras) y fecha.');
      return;
    }

    const chain: { fromIata: string; toIata: string; date: string }[] = [];
    let prev = origin;
    for (const leg of cleanLegs) {
      chain.push({ fromIata: prev, toIata: leg.toIata, date: leg.date });
      prev = leg.toIata;
    }
    if (returnToOrigin) {
      const lastDate = cleanLegs[cleanLegs.length - 1].date;
      const nextDay = new Date(`${lastDate}T00:00:00`);
      nextDay.setDate(nextDay.getDate() + 3);
      chain.push({ fromIata: prev, toIata: origin, date: nextDay.toISOString().slice(0, 10) });
    }

    if (chain.length > MAX_LEGS) {
      setError(`Un circuito admite como maximo ${MAX_LEGS} tramos -- quita alguno.`);
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/circuit-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legs: chain, adults, children })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <details className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6">
      <summary className="flex items-center justify-between cursor-pointer list-none mb-1">
        <span className="flex items-center gap-2">
          <IconMapPin className="w-4 h-4 text-indigo" />
          <h2 className="text-base font-semibold text-ink dark:text-slate-100">Circuito de varias ciudades</h2>
        </span>
        <IconChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-3 mt-2">
        Un viaje por varias ciudades seguidas (ej. Alicante → Cracovia → Viena → Alicante), cada tramo un vuelo directo
        distinto. <strong className="text-slate-600 dark:text-slate-300">Aviso importante</strong>: solo el primer y el
        ultimo tramo (desde/hacia tu origen) se pueden verificar contra datos reales de Aena. Los tramos intermedios
        (entre 2 ciudades que no son tu origen) se buscan directamente sin poder comprobar antes si existe vuelo
        directo -- si no lo hay, ese tramo saldra vacio. Maximo {MAX_LEGS} tramos en total (cada uno gasta 1 peticion
        real de Ignav, sin rango de fechas).
      </p>

      <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-2">
        Origen (tu ciudad de salida)
        <select
          className="mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100 w-full sm:w-40"
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

      <div className="space-y-2 mb-2">
        {legs.map((leg, i) => (
          <div key={i} className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400 dark:text-slate-500 w-16 shrink-0">Tramo {i + 1}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">{i === 0 ? origin : legs[i - 1].toIata || '?'} →</span>
            <input
              type="text"
              maxLength={3}
              placeholder="IATA"
              value={leg.toIata}
              onChange={(e) => updateLeg(i, 'toIata', e.target.value)}
              className="w-16 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 text-sm text-center uppercase text-ink dark:text-slate-100"
            />
            <input
              type="date"
              value={leg.date}
              onChange={(e) => updateLeg(i, 'date', e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 text-sm text-ink dark:text-slate-100"
            />
            {legs.length > 1 && (
              <button onClick={() => removeLeg(i)} className="text-xs text-red-500 hover:text-red-700">
                Quitar
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 mb-3 flex-wrap">
        <button
          onClick={addLeg}
          disabled={legs.length >= MAX_LEGS - 1}
          className="text-xs font-medium text-indigo hover:text-indigo-dark disabled:opacity-40"
        >
          + Añadir tramo
        </button>
        <label className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
          <input type="checkbox" checked={returnToOrigin} onChange={(e) => setReturnToOrigin(e.target.checked)} />
          Volver a {origin || 'origen'} al final
        </label>
      </div>

      <button
        onClick={search}
        disabled={loading}
        className="bg-indigo hover:bg-indigo-dark text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
      >
        {loading ? 'Buscando circuito...' : 'Buscar circuito'}
      </button>

      {error && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{error}</p>}

      {result && (
        <div className="mt-4 space-y-2">
          {result.legs.map((l, i) => (
            <div
              key={i}
              className={`rounded-lg border p-2.5 text-xs ${
                l.found ? 'border-slate-100 dark:border-slate-800' : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950'
              }`}
            >
              <p className="font-medium text-ink dark:text-slate-100">
                {l.fromIata} → {l.toIata} · {new Date(`${l.date}T00:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
              </p>
              {l.found ? (
                <p className="text-slate-500 dark:text-slate-400">
                  {l.price?.toFixed(2)} {l.currency} · {l.airline}
                </p>
              ) : (
                <p className="text-red-600 dark:text-red-400">Sin vuelo directo encontrado para este tramo en esa fecha.</p>
              )}
            </div>
          ))}
          {result.totalPrice !== null ? (
            <p className="text-sm font-semibold text-ink dark:text-slate-100 pt-2 border-t border-slate-100 dark:border-slate-800">
              Total circuito: {result.totalPrice.toFixed(2)} {result.currency}
            </p>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-300 pt-2 border-t border-slate-100 dark:border-slate-800">
              No se puede dar un total: algun tramo no encontro vuelo directo. Prueba otras fechas para ese tramo.
            </p>
          )}
        </div>
      )}
    </details>
  );
}
