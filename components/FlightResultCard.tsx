import type { LiveItinerary } from '@/lib/live-engine';
import { getCityImageUrl } from '@/lib/city-images';
import { getAirlineBadge } from '@/lib/airline-badge';
import { IconPlaneTakeoff, IconPlaneLanding, IconSparkles } from './Icons';

type BookingLink = { provider_name: string; url: string; price?: { amount: number; currency: string } };

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function AirlineBadge({ name }: { name: string }) {
  const badge = getAirlineBadge(name);
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold shrink-0"
      style={{ backgroundColor: badge.bg, color: badge.fg }}
      title={name}
    >
      {badge.initials}
    </span>
  );
}

export default function FlightResultCard({
  result,
  bookingLinks,
  loadingLinks,
  onShowLinks,
  isRecommended
}: {
  result: LiveItinerary;
  bookingLinks?: BookingLink[];
  loadingLinks: boolean;
  onShowLinks: () => void;
  isRecommended?: boolean;
}) {
  const destinationLabel = result.destinationGroupName;
  const imageUrl = getCityImageUrl(destinationLabel);

  return (
    <article
      className={`bg-white dark:bg-slate-900 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden ${
        isRecommended ? 'border-2 border-indigo' : 'border border-slate-100 dark:border-slate-800'
      }`}
    >
      {isRecommended && (
        <div className="bg-indigo text-white text-[11px] font-semibold uppercase tracking-wide px-4 py-1.5 flex items-center gap-1.5">
          <IconSparkles className="w-3 h-3" />
          Recomendado por la IA
        </div>
      )}
      <div className="flex flex-col sm:flex-row">
        <div className="sm:w-40 h-36 sm:h-auto shrink-0">
          <img src={imageUrl} alt={destinationLabel} className="w-full h-full object-cover" loading="lazy" />
        </div>

        <div className="flex-1 p-4 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide bg-indigo-pale dark:bg-indigo-950 text-indigo-dark px-2 py-0.5 rounded-full">
                Directo
              </span>
              <span
                className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${
                  result.source === 'skyscanner' ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {result.source === 'skyscanner' ? 'Sky Scrapper' : 'Ignav'}
              </span>
              {result.isOpenJaw && (
                <span className="text-[10px] font-medium uppercase tracking-wide bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                  Open-jaw
                </span>
              )}
              {result.isSingleIataTarget && (
                <span className="text-[10px] font-medium uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">
                  Destino suelto
                </span>
              )}
            </div>
            <h3 className="font-display text-base text-ink dark:text-slate-100">
              {result.originIata} <span className="text-slate-300 dark:text-slate-500">→</span> {destinationLabel}
            </h3>

            <div className="mt-2 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex flex-wrap items-center gap-1.5">
                <IconPlaneTakeoff className="w-3.5 h-3.5 text-indigo shrink-0" />
                <span className="font-medium text-slate-700 dark:text-slate-300">{result.outbound.origin_iata}</span>
                <span>{formatDateTime(result.outbound.departure_at)}</span>
                <span className="text-slate-300 dark:text-slate-500">→</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{result.outbound.destination_iata}</span>
                <AirlineBadge name={result.outbound.airline} />
                <span className="text-slate-400 dark:text-slate-500">{result.outbound.airline}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <IconPlaneLanding className="w-3.5 h-3.5 text-indigo shrink-0" />
                <span className="font-medium text-slate-700 dark:text-slate-300">{result.inbound.origin_iata}</span>
                <span>{formatDateTime(result.inbound.departure_at)}</span>
                <span className="text-slate-300 dark:text-slate-500">→</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{result.inbound.destination_iata}</span>
                <AirlineBadge name={result.inbound.airline} />
                <span className="text-slate-400 dark:text-slate-500">{result.inbound.airline}</span>
              </div>
            </div>
            {result.notes.length > 0 && <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">{result.notes.join(' ')}</p>}
          </div>

          <div className="flex sm:flex-col items-end justify-between sm:justify-start gap-2 sm:w-36 shrink-0 text-right sm:border-l sm:border-slate-100 sm:pl-4">
            <div>
              <p className="text-lg font-semibold text-ink dark:text-slate-100">
                {result.totalPrice.toFixed(2)} {result.currency}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">Salida hotel {formatDateTime(result.hotelCheckoutAt)}</p>
            </div>
            <button
              onClick={onShowLinks}
              disabled={loadingLinks}
              className="text-xs font-medium bg-indigo hover:bg-indigo-dark text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {loadingLinks ? 'Cargando...' : 'Ver enlaces'}
            </button>
          </div>
        </div>
      </div>

      {bookingLinks && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3 bg-slate-50/60">
          {bookingLinks.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">Sin enlaces disponibles.</p>
          ) : (
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              {bookingLinks.map((link, j) => (
                <li key={j}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo hover:text-indigo-dark underline font-medium"
                  >
                    {link.provider_name} {link.price ? `(${link.price.amount} ${link.price.currency})` : ''}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
