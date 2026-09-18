'use client';

import { useEffect, useState } from 'react';

type PricePoint = { date: string; price: number; currency: string };

export default function PriceHistoryChart({ originIata, destinationIata }: { originIata: string; destinationIata: string }) {
  const [points, setPoints] = useState<PricePoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!opened || points !== null) return;
    setLoading(true);
    fetch(`/api/price-history?origin=${originIata}&destination=${destinationIata}`)
      .then((r) => (r.ok ? r.json() : { points: [] }))
      .then((data) => setPoints(data.points ?? []))
      .catch(() => setPoints([]))
      .finally(() => setLoading(false));
  }, [opened, originIata, destinationIata, points]);

  return (
    <details className="mt-2" onToggle={(e) => setOpened((e.target as HTMLDetailsElement).open)}>
      <summary className="text-[11px] text-slate-400 dark:text-slate-500 cursor-pointer list-none underline decoration-dotted">
        Ver evolucion de precio de esta ruta
      </summary>
      <div className="mt-1.5">
        {loading && <p className="text-[11px] text-slate-400 dark:text-slate-500">Cargando...</p>}
        {points && points.length < 2 && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Todavia no hay suficiente historial de esta ruta -- se va acumulando con cada busqueda.
          </p>
        )}
        {points && points.length >= 2 && <Sparkline points={points} />}
      </div>
    </details>
  );
}

function Sparkline({ points }: { points: PricePoint[] }) {
  const width = 260;
  const height = 60;
  const padding = 4;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = padding + (i / (points.length - 1)) * (width - padding * 2);
    const y = height - padding - ((p.price - min) / range) * (height - padding * 2);
    return { x, y };
  });
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const first = points[0];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-16">
        <path d={path} fill="none" stroke="#6366f1" strokeWidth={1.5} />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 2.5 : 1.5} fill="#6366f1" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
        <span>{new Date(first.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</span>
        <span>
          Min {min.toFixed(0)} / Max {max.toFixed(0)} {last.currency}
        </span>
        <span>{new Date(last.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</span>
      </div>
    </div>
  );
}
