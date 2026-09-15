import { IconPlaneTakeoff, IconCompass, IconChevronDown } from './Icons';

// Tira compacta de ruta: muestra origen/destino REALMENTE seleccionados en el
// formulario (no un listado curado aparte), con una linea de vuelo animada. Al tocarla,
// baja hasta el formulario de busqueda para editar la seleccion -- antes era pura
// decoracion sin ninguna accion asociada, lo que confundia (parecia que se podia tocar
// pero no pasaba nada).

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

  function goToSearchForm() {
    document.getElementById('search-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <button
      type="button"
      onClick={goToSearchForm}
      className="w-full text-left bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:border-indigo/40 hover:shadow-md transition-all px-5 py-4 md:px-8 md:py-5"
    >
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
      <div className="flex items-center gap-3 md:gap-6">
        <div className="min-w-0 shrink-0 max-w-[34%]">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Origen</p>
          <p className="text-sm md:text-base font-display text-ink dark:text-slate-100 truncate">{formatSide(originLabels, 'Elige origen')}</p>
        </div>

        <div className="relative flex-1 h-6 text-indigo/60 hidden sm:block">
          <svg viewBox="0 0 200 20" className="w-full h-full overflow-visible" preserveAspectRatio="none">
            <path d="M4 10 Q 100 -6 196 10" fill="none" stroke="currentColor" strokeWidth={1.2} strokeOpacity={0.5} className="flightpath-line" />
          </svg>
          {hasRoute && (
            <div className="absolute top-0 left-0 flightpath-plane text-indigo">
              <IconPlaneTakeoff className="w-4 h-4" />
            </div>
          )}
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent sm:hidden" />

        <div className="min-w-0 shrink-0 max-w-[34%] text-right">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Destino</p>
          <p className="text-sm md:text-base font-display text-ink dark:text-slate-100 truncate">{formatSide(destinationLabels, 'Elige destino')}</p>
        </div>

        <IconChevronDown className="w-4 h-4 text-slate-300 dark:text-slate-600 -rotate-90 shrink-0" />
      </div>

      {combos > 0 && (
        <p className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
          <IconCompass className="w-3.5 h-3.5 text-indigo/70" />
          {combos} combinacion{combos === 1 ? '' : 'es'} origen x destino en esta busqueda
          {combos > 6 && <span className="text-red-500 dark:text-red-400"> (maximo 6)</span>}
        </p>
      )}
    </button>
  );
}
