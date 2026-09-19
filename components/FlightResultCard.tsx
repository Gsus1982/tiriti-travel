'use client';

import { useEffect, useState } from 'react';
import type { LiveItinerary } from '@/lib/live-engine';
import { getCityImageUrl } from '@/lib/city-images';
import { getAirlineBadge } from '@/lib/airline-badge';
import { getBaggageInfo } from '@/lib/airline-baggage-notes';
import { IconPlaneTakeoff, IconPlaneLanding, IconSparkles } from './Icons';
import PriceHistoryChart from './PriceHistoryChart';
import DestinationTipsButton from './DestinationTipsButton';

type BookingLink = {
  provider_name: string;
  url: string;
  price?: { amount: number; currency: string };
  leg?: 'outbound' | 'inbound';
};

function formatPrice(total: number, currency: string, paxCount: number | undefined, perPerson: boolean): { main: string; note?: string } {
  if (paxCount && paxCount > 1 && perPerson) {
    return { main: `${(total / paxCount).toFixed(2)} ${currency}`, note: `${total.toFixed(2)} ${currency} total` };
  }
  if (paxCount && paxCount > 1) {
    return { main: `${total.toFixed(2)} ${currency}`, note: `${(total / paxCount).toFixed(2)} ${currency}/persona` };
  }
  return { main: `${total.toFixed(2)} ${currency}` };
}

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

// FIX (v0.11.5, bug real reportado con captura): antes se mostraba el error tecnico
// completo de Ignav (JSON crudo con "type":"upstream_error", etc.) directamente al
// usuario en el tramo fallido. Ahora se traduce a un mensaje honesto y corto, sin jerga
// de API, y se distingue explicitamente si el fallo es tras reintentar (persistente) o
// solo informativo.
function friendlyLegError(rawMessage: string, legLabel: string): string {
  const looksLikeUpstreamOutage = /upstream_error|unable_to_complete_request|424/i.test(rawMessage);
  if (looksLikeUpstreamOutage) {
    return `Ignav no pudo recuperar los enlaces de ${legLabel.toLowerCase()} tras varios intentos. Puede ser un problema temporal del proveedor -- vuelve a pulsar "Ver enlaces" en unos segundos.`;
  }
  return `No se pudieron obtener enlaces de ${legLabel.toLowerCase()}: ${rawMessage}`;
}

function BookingLinks({ links }: { links: BookingLink[] | null }) {
  if (links === null) return null;
  if (links.length === 0) return <p className="text-xs text-slate-400 dark:text-slate-500">Sin enlaces disponibles para este itinerario.</p>;

  const outbound = links.filter((link) => link.leg === 'outbound');
  const inbound = links.filter((link) => link.leg === 'inbound');
  const renderLinks = (items: BookingLink[], label: string) => (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">No se devolvieron enlaces para este tramo.</p>
      ) : (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {items.map((link, j) => (
            <li key={`${label}-${j}`}>
              <a href={link.url} target="_blank" rel="noreferrer" className="text-xs text-indigo hover:text-indigo-dark underline font-medium">
                {link.provider_name} {link.price ? `(${link.price.amount} ${link.price.currency})` : ''}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {renderLinks(outbound, 'Ida')}
      {renderLinks(inbound, 'Vuelta')}
    </div>
  );
}

export default function FlightResultCard({
  result,
  bookingLinks: _legacyBookingLinks,
  loadingLinks: _legacyLoadingLinks,
  onShowLinks: _legacyOnShowLinks,
  isRecommended,
  compact,
  isComparing,
  onToggleCompare,
  cheaperAlternative,
  paxCount,
  perPerson,
  childrenCount
}: {
  result: LiveItinerary;
  bookingLinks?: BookingLink[];
  loadingLinks: boolean;
  onShowLinks: () => void;
  isRecommended?: boolean;
  compact?: boolean;
  isComparing?: boolean;
  onToggleCompare?: () => void;
  cheaperAlternative?: LiveItinerary | null;
  paxCount?: number;
  perPerson?: boolean;
  childrenCount?: number;
}) {
  const destinationLabel = result.destinationName;
  const imageUrl = getCityImageUrl(destinationLabel);
  const [localLinks, setLocalLinks] = useState<BookingLink[] | null>(null);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linksErrors, setLinksErrors] = useState<string[]>([]);
  const [justRecommended, setJustRecommended] = useState(false);

  useEffect(() => {
    if (!isRecommended) return;
    setJustRecommended(true);
    const timeout = setTimeout(() => setJustRecommended(false), 1400);
    return () => clearTimeout(timeout);
  }, [isRecommended]);

  async function loadBothBookingLinks() {
    setLinksLoading(true);
    setLinksErrors([]);
    const loadLeg = async (ignavId: string, leg: 'outbound' | 'inbound') => {
      const response = await fetch('/api/booking-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ignavId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `No se pudieron obtener enlaces de ${leg === 'outbound' ? 'ida' : 'vuelta'}`);
      return (data.booking_options ?? []).flatMap((option: any) =>
        (option.links ?? []).map((link: Omit<BookingLink, 'leg'>) => ({ ...link, leg }))
      ) as BookingLink[];
    };

    // Bug corregido en v0.11.4: antes la pagina solo consultaba result.outbound.ignav_id.
    // Las dos consultas son independientes y se lanzan en paralelo.
    const [outboundResult, inboundResult] = await Promise.allSettled([
      loadLeg(result.outbound.ignav_id, 'outbound'),
      loadLeg(result.inbound.ignav_id, 'inbound')
    ]);

    const links: BookingLink[] = [];
    const errors: string[] = [];
    if (outboundResult.status === 'fulfilled') links.push(...outboundResult.value);
    else errors.push(friendlyLegError(outboundResult.reason instanceof Error ? outboundResult.reason.message : String(outboundResult.reason), 'Ida'));
    if (inboundResult.status === 'fulfilled') links.push(...inboundResult.value);
    else errors.push(friendlyLegError(inboundResult.reason instanceof Error ? inboundResult.reason.message : String(inboundResult.reason), 'Vuelta'));

    setLocalLinks(links);
    setLinksErrors(errors);
    setLinksLoading(false);
  }

  const cardBorderClass = isRecommended
    ? `border-2 border-indigo ${justRecommended ? 'ring-4 ring-indigo/40 scale-[1.01]' : ''}`
    : 'border border-slate-100 dark:border-slate-800';
  const saving = cheaperAlternative ? result.totalPrice - cheaperAlternative.totalPrice : null;

  if (compact) {
    return (
      <article className={`bg-white dark:bg-slate-900 rounded-xl shadow-sm hover:shadow-md transition-all overflow-hidden ${cardBorderClass}`}>
        <div className="flex items-center gap-3 px-3 py-2.5">
          {onToggleCompare && <input type="checkbox" checked={!!isComparing} onChange={onToggleCompare} title="Comparar esta opcion" className="shrink-0" />}
          <img src={imageUrl} alt={destinationLabel} className="w-10 h-10 rounded-lg object-cover shrink-0" loading="lazy" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink dark:text-slate-100 truncate">{result.originIata} → {destinationLabel}{isRecommended && <IconSparkles className="w-3.5 h-3.5 text-indigo inline ml-1.5 -mt-0.5" />}</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{formatDateTime(result.outbound.departure_at)} → {formatDateTime(result.inbound.departure_at)} · Salida hotel {formatDateTime(result.hotelCheckoutAt)}</p>
          </div>
          {saving !== null && <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded-full shrink-0">-{saving.toFixed(0)}€ casi igual</span>}
          <p className="text-sm font-semibold text-ink dark:text-slate-100 shrink-0 whitespace-nowrap">{formatPrice(result.totalPrice, result.currency, paxCount, !!perPerson).main}</p>
          <button onClick={loadBothBookingLinks} disabled={linksLoading} className="text-xs font-medium bg-indigo hover:bg-indigo-dark text-white px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap shrink-0">{linksLoading ? '...' : 'Enlaces'}</button>
        </div>
        <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-2 bg-slate-50/60">
          <BookingLinks links={localLinks} />
          {linksErrors.map((msg, i) => <p key={i} className="text-xs text-amber-700 mt-2">{msg}</p>)}
        </div>
      </article>
    );
  }

  return (
    <article className={`bg-white dark:bg-slate-900 rounded-2xl shadow-sm hover:shadow-md transition-all overflow-hidden ${cardBorderClass}`}>
      {isRecommended && <div className="bg-indigo text-white text-[11px] font-semibold uppercase tracking-wide px-4 py-1.5 flex items-center gap-1.5"><IconSparkles className="w-3 h-3" />Recomendado por la IA</div>}
      <div className="flex flex-row">
        <div className="w-16 h-16 sm:w-24 sm:h-24 m-3 shrink-0 relative rounded-xl overflow-hidden">
          <img src={imageUrl} alt={destinationLabel} className="w-full h-full object-cover" loading="lazy" />
          {onToggleCompare && (
            <label className="absolute bottom-0.5 left-0.5 right-0.5 bg-white/90 dark:bg-slate-900/90 rounded px-1 py-0.5 flex items-center justify-center gap-1 text-[8px] sm:text-[9px] font-medium text-ink dark:text-slate-100 cursor-pointer">
              <input type="checkbox" checked={!!isComparing} onChange={onToggleCompare} className="scale-75" />
              Comparar
            </label>
          )}
        </div>
        <div className="flex-1 p-4 pl-0 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide bg-indigo-pale dark:bg-indigo-950 text-indigo-dark px-2 py-0.5 rounded-full">Directo</span>
              <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${result.source === 'skyscanner' ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-500'}`}>{result.source === 'skyscanner' ? 'Sky Scrapper' : 'Ignav'}</span>
              {result.isOpenJaw && <span className="text-[10px] font-medium uppercase tracking-wide bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">Open-jaw</span>}
              {saving !== null && <span title={`Hay otra opcion ${saving.toFixed(0)} EUR mas barata, saliendo del hotel poco antes`} className="text-[10px] font-medium uppercase tracking-wide bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">-{saving.toFixed(0)}€ casi igual</span>}
            </div>
            <h3 className="font-display text-base text-ink dark:text-slate-100">{result.originIata} <span className="text-slate-300 dark:text-slate-500">→</span> {destinationLabel}</h3>
            <div className="mt-2 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex flex-wrap items-center gap-1.5"><IconPlaneTakeoff className="w-3.5 h-3.5 text-indigo shrink-0" /><span className="font-medium text-slate-700 dark:text-slate-300">{result.outbound.origin_iata}</span><span>{formatDateTime(result.outbound.departure_at)}</span><span className="text-slate-300 dark:text-slate-500">→</span><span className="font-medium text-slate-700 dark:text-slate-300">{result.outbound.destination_iata}</span><AirlineBadge name={result.outbound.airline} /><span className="text-slate-400 dark:text-slate-500">{result.outbound.airline}</span></div>
              <div className="flex flex-wrap items-center gap-1.5"><IconPlaneLanding className="w-3.5 h-3.5 text-indigo shrink-0" /><span className="font-medium text-slate-700 dark:text-slate-300">{result.inbound.origin_iata}</span><span>{formatDateTime(result.inbound.departure_at)}</span><span className="text-slate-300 dark:text-slate-500">→</span><span className="font-medium text-slate-700 dark:text-slate-300">{result.inbound.destination_iata}</span><AirlineBadge name={result.inbound.airline} /><span className="text-slate-400 dark:text-slate-500">{result.inbound.airline}</span></div>
              {Array.from(
                new Set(
                  [getBaggageInfo(result.outbound.airline), getBaggageInfo(result.inbound.airline)].filter(Boolean) as ReturnType<
                    typeof getBaggageInfo
                  >[]
                )
              ).map((info, i) => (
                <p key={i} className="text-[10px] text-amber-700 dark:text-amber-300 mt-0.5">
                  🧳 {info!.note} Bolso gratis: {info!.freeBagCm}
                  {info!.freeBagKg ? `, ${info!.freeBagKg}` : ''} (aproximado, comprueba antes de viajar).
                </p>
              ))}
            </div>
            {result.notes.length > 0 && <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">{result.notes.join(' ')}</p>}
            {result.cheaperOtherDay && (
              <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 rounded-lg px-2 py-1 inline-block">
                Sale {result.cheaperOtherDay.savings}€ mas barato saliendo el{' '}
                {new Date(result.cheaperOtherDay.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}.
              </p>
            )}
            {result.holidays && result.holidays.length > 0 && (
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 rounded-lg px-2 py-1 inline-block">
                Coincide con festivo: {result.holidays.map((h) => h.localName).join(', ')}.
              </p>
            )}
            <details className="mt-2 group">
              <summary className="text-[11px] text-slate-400 dark:text-slate-500 cursor-pointer list-none underline decoration-dotted">
                Mas detalles del destino
              </summary>
              <div className="mt-1.5 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                {result.co2Estimate && (
                  <p>
                    🌍 CO₂ estimado ida y vuelta: ~{result.co2Estimate.kgPerPassenger} kg/pasajero ({result.co2Estimate.distanceKm} km
                    por trayecto).
                  </p>
                )}
                {result.climate && (
                  <p>
                    ☀️ Clima habitual esas fechas: {result.climate.avgMinC}-{result.climate.avgMaxC}°C,{' '}
                    {result.climate.avgPrecipMm} mm de lluvia (promedio de {result.climate.yearsUsed} años).
                  </p>
                )}
                {result.exchangeRate && (
                  <p>
                    💱 1 EUR ≈ {result.exchangeRate.rate.toFixed(2)} {result.exchangeRate.currency}
                  </p>
                )}
                {result.climate && <p className="text-[10px] text-slate-400 dark:text-slate-600">Clima: Open-Meteo.com (CC BY 4.0)</p>}
              </div>
              <PriceHistoryChart originIata={result.originIata} destinationIata={result.destinationId.split('+')[0]} />
              <DestinationTipsButton
                destinationName={destinationLabel.replace(/\s*\([^)]*\)\s*$/, '')}
                country={destinationLabel.match(/\(([^)]*)\)\s*$/)?.[1] ?? ''}
                countryIso2={result.destinationCountryIso2}
                month={new Date(result.outbound.departure_at).getMonth() + 1}
                climate={result.climate}
                childrenCount={childrenCount}
              />
            </details>
          </div>
          <div className="flex sm:flex-col items-end justify-between sm:justify-start gap-2 sm:w-36 shrink-0 text-right sm:border-l sm:border-slate-100 sm:pl-4">
            <div>
              <p className="text-lg font-semibold text-ink dark:text-slate-100">{formatPrice(result.totalPrice, result.currency, paxCount, !!perPerson).main}</p>
              {formatPrice(result.totalPrice, result.currency, paxCount, !!perPerson).note && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500">{formatPrice(result.totalPrice, result.currency, paxCount, !!perPerson).note}</p>
              )}
              {result.priceTrend && result.totalPrice / result.priceTrend.avgPrice <= 0.65 && (
                <p
                  className="text-[10px] font-bold uppercase tracking-wide text-white bg-gradient-to-r from-orange-500 to-red-500 rounded-full px-2 py-0.5 inline-block mb-0.5"
                  title={`Promedio historico de esta ruta: ${result.priceTrend.avgPrice.toFixed(0)} ${result.currency}`}
                >
                  🔥 Chollo
                </p>
              )}
              {result.priceTrend && (
                <p
                  className={`text-[10px] font-medium uppercase tracking-wide ${
                    result.priceTrend.label === 'bajo'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : result.priceTrend.label === 'alto'
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                  title={`Promedio historico de esta ruta: ${result.priceTrend.avgPrice.toFixed(0)} ${result.currency} (${result.priceTrend.sampleSize} busquedas previas)`}
                >
                  Precio {result.priceTrend.label} para esta ruta
                </p>
              )}
              <p className="text-[11px] text-slate-400 dark:text-slate-500">Salida hotel {formatDateTime(result.hotelCheckoutAt)}</p>
            </div>
            <button onClick={loadBothBookingLinks} disabled={linksLoading} className="text-xs font-medium bg-indigo hover:bg-indigo-dark text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap">{linksLoading ? 'Cargando...' : 'Ver enlaces'}</button>
          </div>
        </div>
      </div>
      {localLinks !== null && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3 bg-slate-50/60">
          <BookingLinks links={localLinks} />
          {linksErrors.map((msg, i) => <p key={i} className="text-xs text-amber-700 mt-2">{msg}</p>)}
        </div>
      )}
    </article>
  );
}
