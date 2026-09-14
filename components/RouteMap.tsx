'use client';

import { useEffect, useState } from 'react';

type Airport = {
  iata: string;
  city: string;
  country: string;
  group_id: string | null;
  lat: number;
  lon: number;
  is_origin_candidate: boolean;
};

const LON_MIN = -26;
const LON_MAX = 26;
const LAT_MIN = 36;
const LAT_MAX = 65;
const WIDTH = 800;
const HEIGHT = 420;

function project(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * WIDTH;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * HEIGHT;
  return { x, y };
}

export default function RouteMap() {
  const [origins, setOrigins] = useState<Airport[]>([]);
  const [destinations, setDestinations] = useState<Airport[]>([]);
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/route-map')
      .then((r) => r.json())
      .then((data) => {
        setOrigins(data.origins ?? []);
        setDestinations(data.destinations ?? []);
        if (data.origins?.[0]) setSelectedOrigin(data.origins[0].iata);
      })
      .catch(() => {});
  }, []);

  const activeOrigin = origins.find((o) => o.iata === selectedOrigin) ?? origins[0];

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-base font-semibold text-slate-900">Mapa de rutas directas</h2>
        <div className="flex gap-4 text-sm border-b border-slate-200">
          {origins.map((o) => (
            <button
              key={o.iata}
              onClick={() => setSelectedOrigin(o.iata)}
              className={`pb-2 -mb-px border-b-2 transition-colors ${
                o.iata === selectedOrigin
                  ? 'border-brand-600 text-brand-600 font-medium'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {o.city}
            </button>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes twflow-dash { to { stroke-dashoffset: -24; } }
        .twflow-line { stroke-dasharray: 4 6; animation: twflow-dash 1.6s linear infinite; }
      `}</style>
      <div className="w-full overflow-x-auto rounded-xl bg-slate-50 text-brand-600">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full min-w-[600px] h-auto">
          {activeOrigin &&
            destinations.map((d) => {
              const p1 = project(activeOrigin.lat, activeOrigin.lon);
              const p2 = project(d.lat, d.lon);
              return (
                <line
                  key={d.iata}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="currentColor"
                  strokeWidth={1}
                  strokeOpacity={0.45}
                  className="twflow-line"
                />
              );
            })}
          {destinations.map((d) => {
            const p = project(d.lat, d.lon);
            return (
              <g key={d.iata}>
                <circle cx={p.x} cy={p.y} r={2.5} className="fill-slate-400" />
                <text x={p.x + 5} y={p.y + 3} fontSize={9} className="fill-slate-500">
                  {d.city}
                </text>
              </g>
            );
          })}
          {origins.map((o) => {
            const p = project(o.lat, o.lon);
            const isActive = o.iata === selectedOrigin;
            return (
              <g key={o.iata}>
                <circle cx={p.x} cy={p.y} r={isActive ? 5.5 : 3.5} className={isActive ? 'fill-slate-900' : 'fill-slate-400'} />
                <text x={p.x + 7} y={p.y + 4} fontSize={11} fontWeight={600} className="fill-slate-900">
                  {o.city}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-xs text-slate-400 mt-3">
        Destinos curados con datos de vuelo y hotel asociados, alcanzables en directo desde el origen seleccionado.
      </p>
    </section>
  );
}
