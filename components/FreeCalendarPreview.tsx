'use client';

import { useState } from 'react';

type FreeCalendarDay = { date: string; price: number | null };

export default function FreeCalendarPreview({ origin, destination }: { origin: string; destination: string }) {
  const [yearMonth, setYearMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [days, setDays] = useState<FreeCalendarDay[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  async function load() {
    if (!origin || !destination) {
      setError('Elige origen y destino primero.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/free-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, destination, yearMonth })
      });
      if (res.status === 503) {
        setUnavailable(true);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
      setDays(data.days ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const prices = (days ?? []).map((d) => d.price).filter((p): p is number => p !== null);
  const min = prices.length ? Math.min(...prices) : null;
  const max = prices.length ? Math.max(...prices) : null;

  function heat(price: number | null): React.CSSProperties {
    if (price === null || min === null || max === null) return {};
    const range = max - min || 1;
    const hue = 150 - ((price - min) / range) * 150;
    return { backgroundColor: `hsl(${hue}, 65%, 92%)` };
  }

  if (unavailable) {
    return (
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Vista gratis no configurada todavia (falta <code>TRAVELPAYOUTS_TOKEN</code>).
      </p>
    );
  }

  return (
    <div className="border-t border-slate-100 dark:border-slate-800 pt-3 mt-3">
      <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
        Vista previa gratis (Travelpayouts, sin gastar tu cuota de Ignav)
      </p>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
        Precios orientativos de otros viajeros para decidir que dias merece la pena consultar de verdad con el calendario
        de arriba, antes de gastar cuota real.
      </p>
      <div className="flex gap-2 items-end mb-2">
        <input
          type="month"
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
          className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm text-ink dark:text-slate-100"
        />
        <button
          onClick={load}
          disabled={loading}
          className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-ink dark:text-slate-100 text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-50"
        >
          {loading ? 'Cargando...' : 'Ver mes'}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-500 dark:text-red-400 mb-2">{error}</p>}
      {days && days.length > 0 && (
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => (
            <div key={d.date} style={heat(d.price)} className="text-center rounded p-1 text-[10px] border border-slate-100 dark:border-slate-700">
              <div>{d.date.slice(8, 10)}</div>
              <div>{d.price !== null ? d.price.toFixed(0) : '-'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
