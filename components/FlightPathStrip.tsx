import { IconPlaneTakeoff, IconCompass } from './Icons';

// Sustituye al antiguo RouteMap.tsx: aquel dibujaba un mapa SVG grande (420px de alto)
// sobre un listado de "destinos curados" que la propia app dejo de usar como fuente
// principal (ver nota en el selector de destinos), asi que casi siempre estaba vacio o
// desactualizado -- de ahi la queja de "mapa inservible que ocupa mucho sitio". Esta tira
// es deliberadamente compacta y refleja los origenes/destinos que el usuario tiene
// REALMENTE seleccionados en el formulario de abajo, asi que nunca muestra datos que no
// tengan que ver con la busqueda actual.

function formatSide(labels: string[], placeholder: string): string {
  if (labels.length === 0) return placeholder;
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} + ${labels[1]}`;
  return `${labels[0]} +${labels.length - 1}`;
}

export default function FlightPathStrip({
  originLabels,
  destinationLabels,
  combos
}: {
  originLabels: string[];
  destinationLabels: string[];
  combos: number;
}) {
  const hasRoute = originLabels.length > 0 && destinationLabels.length > 0;

  return (
    <section className="bg-ink-panel rounded-2xl border border-white/10 px-5 py-4 md:px-8 md:py-5">
      <style>{`
        @keyframes flightpath-dash { to { stroke-dashoffset: -20; } }
        .flightpath-line { stroke-dasharray: 3 5; animation: flightpath-dash 1.4s linear infinite; }
        @keyframes flightpath-fly {
          0%   { transform: translate(-2px, 4px) rotate(-2deg); opacity: 0; }
          10%  { opacity: 1; }
          50%  { transform: translate(calc(50% - 8px), -8px) rotate(-2deg); }
          90%  { opacity: 1; }
          100% { transform: translate(calc(100% - 14px), 4px) rotate(-2deg); opacity: 0; }
        }
        .flightpath-plane { animation: flightpath-fly 3.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .flightpath-line, .flightpath-plane { animation: none; }
        }
      `}</style>
      <div className="flex items-center gap-4 md:gap-6">
        <div className="min-w-0 shrink-0 max-w-[38%]">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Origen</p>
          <p className="text-sm md:text-base font-display text-white truncate">{formatSide(originLabels, 'Elige origen')}</p>
        </div>

        <div className="relative flex-1 h-6 text-gold/70 hidden sm:block">
          <svg viewBox="0 0 200 20" className="w-full h-full overflow-visible" preserveAspectRatio="none">
            <path d="M4 10 Q 100 -6 196 10" fill="none" stroke="currentColor" strokeWidth={1.2} strokeOpacity={0.4} className="flightpath-line" />
          </svg>
          {hasRoute && (
            <div className="absolute top-0 left-0 flightpath-plane text-gold">
              <IconPlaneTakeoff className="w-4 h-4" />
            </div>
          )}
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-white/15 to-white/0 sm:hidden" />


        <div className="min-w-0 shrink-0 max-w-[38%] text-right">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Destino</p>
          <p className="text-sm md:text-base font-display text-white truncate">{formatSide(destinationLabels, 'Elige destino')}</p>
        </div>
      </div>

      {combos > 0 && (
        <p className="mt-3 pt-3 border-t border-white/5 text-xs text-white/40 flex items-center gap-1.5">
          <IconCompass className="w-3.5 h-3.5 text-gold/60" />
          {combos} combinacion{combos === 1 ? '' : 'es'} origen x destino en esta busqueda
          {combos > 6 && <span className="text-red-300/80"> (maximo 6)</span>}
        </p>
      )}
    </section>
  );
}
