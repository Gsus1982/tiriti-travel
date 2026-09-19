'use client';

import { useEffect, useState } from 'react';
import { IconCalendar, IconBell, IconGauge } from './Icons';
import PushNotificationSetup from './PushNotificationSetup';
import FreeCalendarPreview from './FreeCalendarPreview';
import { getVisitedDestinations, toggleVisitedDestination } from '@/lib/visited-destinations';

type IgnavUsage = { totalUsed: number; remaining: number; last7Days: number; last30Days: number; quota: number; comboLimit: number };

type CalendarDay = { date: string; minPrice: number | null; currency: string | null; flightCount: number };

type SavedAlert = {
  id: number;
  created_at: string;
  origin_iatas: string[];
  destination_iata: string | null;
  outbound_date_from: string;
  inbound_date_from: string;
  max_price_total: string;
  label: string | null;
  last_checked_at: string | null;
  last_min_price: string | null;
  last_match_found: boolean;
  active: boolean;
  email: string | null;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

export default function ToolsPanel({
  originIatas,
  destinationIatas,
  outboundDateFrom,
  outboundDateTo,
  inboundDateFrom,
  inboundDateTo,
  adults,
  children,
  maxPriceTotal
}: {
  originIatas: string[];
  destinationIatas: string[];
  outboundDateFrom: string;
  outboundDateTo: string;
  inboundDateFrom: string;
  inboundDateTo: string;
  adults: number;
  children: number;
  maxPriceTotal: number | '';
}) {
  const [calendarDays, setCalendarDays] = useState<CalendarDay[] | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarDest, setCalendarDest] = useState('');

  const [usage, setUsage] = useState<IgnavUsage | null>(null);
  const [visited, setVisited] = useState<string[]>([]);

  useEffect(() => {
    setVisited(getVisitedDestinations());
  }, []);
  const [usageUnavailable, setUsageUnavailable] = useState(false);

  useEffect(() => {
    fetch('/api/ignav-usage')
      .then((r) => {
        if (!r.ok) throw new Error('no disponible');
        return r.json();
      })
      .then(setUsage)
      .catch(() => setUsageUnavailable(true));
  }, []);

  const [alertLabel, setAlertLabel] = useState('');
  const [alertEmail, setAlertEmail] = useState('');
  const [alertMaxPrice, setAlertMaxPrice] = useState<number | ''>(maxPriceTotal);
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const [savedAlerts, setSavedAlerts] = useState<SavedAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function loadAlerts() {
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      const res = await fetch('/api/alerts');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
      setSavedAlerts(data.alerts ?? []);
    } catch (e: any) {
      setAlertsError(e.message);
    } finally {
      setAlertsLoading(false);
    }
  }

  useEffect(() => {
    loadAlerts();
  }, []);

  async function runCalendar() {
    if (!originIatas[0] || !calendarDest) {
      setCalendarError('Indica un aeropuerto IATA de destino (ej. DUB) para el calendario.');
      return;
    }
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const res = await fetch('/api/price-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: originIatas[0],
          destination: calendarDest.toUpperCase(),
          dateFrom: outboundDateFrom,
          dateTo: outboundDateTo,
          adults,
          children
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
      setCalendarDays(data.days);
    } catch (e: any) {
      setCalendarError(e.message);
    } finally {
      setCalendarLoading(false);
    }
  }

  async function saveAlert() {
    if (!alertMaxPrice) {
      setAlertMessage('Indica un precio maximo total para poder guardar la alerta (campo justo debajo).');
      return;
    }
    if (!destinationIatas[0]) {
      setAlertMessage('Elige al menos un destino en el buscador de arriba para poder guardar la alerta.');
      return;
    }
    setAlertSaving(true);
    setAlertMessage(null);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originIatas,
          destinationIata: destinationIatas[0] ?? null,
          outboundDateFrom,
          outboundDateTo,
          inboundDateFrom,
          inboundDateTo,
          adults,
          children,
          maxPriceTotal: alertMaxPrice,
          label: alertLabel || null,
          email: alertEmail || null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
      setAlertMessage(
        alertEmail
          ? `Alerta guardada (limite ${alertMaxPrice} EUR). Te avisaremos por email a ${alertEmail} si el precio baja de ese limite.`
          : `Alerta guardada (limite ${alertMaxPrice} EUR). Un cron diario comprobara el precio y lo veras aqui la proxima vez (sin email configurado).`
      );
      loadAlerts();
    } catch (e: any) {
      setAlertMessage(`Error: ${e.message}`);
    } finally {
      setAlertSaving(false);
    }
  }

  async function deleteAlert(id: number) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/alerts?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
      setSavedAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (e: any) {
      setAlertsError(e.message);
    } finally {
      setDeletingId(null);
    }
  }

  const minOfCalendar = calendarDays?.reduce<number | null>((min, d) => {
    if (d.minPrice === null) return min;
    if (min === null || d.minPrice < min) return d.minPrice;
    return min;
  }, null);
  const maxOfCalendar = calendarDays?.reduce<number | null>((max, d) => {
    if (d.minPrice === null) return max;
    if (max === null || d.minPrice > max) return d.minPrice;
    return max;
  }, null);

  // Mapa de calor: interpola entre verde (barato) y rojo (caro) segun donde cae el
  // precio del dia dentro del rango minimo-maximo encontrado. Con un unico precio
  // (rango 0) se queda en verde neutro.
  function heatmapStyle(price: number | null): React.CSSProperties {
    if (price === null || minOfCalendar === null || maxOfCalendar === null || minOfCalendar === undefined || maxOfCalendar === undefined) {
      return {};
    }
    const range = maxOfCalendar - minOfCalendar;
    const ratio = range === 0 ? 0 : (price - minOfCalendar) / range;
    // Verde (~150,50%) a rojo (~0,50%) en HSL, pasando por amarillo -- ratio 0 = mas
    // barato, 1 = mas caro.
    const hue = 150 - ratio * 150;
    return { backgroundColor: `hsl(${hue}, 65%, 92%)`, borderColor: `hsl(${hue}, 55%, 75%)` };
  }

  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 space-y-6">
      {usage && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <IconGauge className="w-4 h-4 text-indigo" />
            <h2 className="text-base font-semibold text-ink dark:text-slate-100">Cuota de Ignav</h2>
          </div>
          <div className="flex items-baseline justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>
              <strong className="text-ink dark:text-slate-100 text-sm">{usage.remaining}</strong> de {usage.quota} peticiones
              restantes (de por vida)
            </span>
            <span>{usage.last7Days} en los ultimos 7 dias</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                usage.remaining / usage.quota > 0.5
                  ? 'bg-emerald-500'
                  : usage.remaining / usage.quota > 0.2
                  ? 'bg-amber-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${Math.max(2, (usage.remaining / usage.quota) * 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
            Se agota y no se renueva -- cada busqueda gasta origenes x destinos x dias de peticiones reales. Por eso ahora
            mismo el maximo de combinaciones origen x destino permitido es{' '}
            <strong className="text-slate-600 dark:text-slate-300">{usage.comboLimit}</strong> (sube a 10 con mucha cuota,
            baja a 3 con poca).
          </p>
        </div>
      )}
      {usageUnavailable && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Contador de cuota no disponible todavia (falta aplicar la migracion de la tabla <code>ignav_usage_log</code> en
          Neon).
        </p>
      )}

      {visited.length > 0 && (
        <details className="border-t border-slate-100 dark:border-slate-800 pt-4">
          <summary className="text-sm font-semibold text-ink dark:text-slate-100 cursor-pointer list-none">
            Destinos marcados como visitados ({visited.length})
          </summary>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 mb-2">
            Se excluyen de "Sorprendeme" y aparecen atenuados en "Ideas de destino". Se marcan desde ahi mismo (boton "Ya he
            estado aqui" en cada tarjeta); aqui puedes quitarlos.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {visited.map((iata) => (
              <button
                key={iata}
                onClick={() => setVisited(toggleVisitedDestination(iata))}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-red-300 hover:text-red-600 transition-colors"
                title="Quitar de visitados"
              >
                {iata} ✕
              </button>
            ))}
          </div>
        </details>
      )}

      <div className={usage || usageUnavailable ? 'border-t border-slate-100 dark:border-slate-800 pt-4' : ''}>
        <div className="flex items-center gap-2 mb-2">
          <IconCalendar className="w-4 h-4 text-indigo" />
          <h2 className="text-base font-semibold text-ink dark:text-slate-100">Calendario de precios (un solo tramo)</h2>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
          Precio minimo por dia entre las fechas de ida seleccionadas arriba, para el primer origen elegido. Hasta 30 dias
          por consulta -- el maximo real varia segun tu cuota restante de Ignav (mira "Cuota de Ignav" arriba).
        </p>
        <div className="flex gap-2 items-end flex-wrap">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Destino IATA
            <input
              type="text"
              maxLength={3}
              placeholder="DUB"
              className="mt-1 w-24 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-lg p-2 text-sm text-ink dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 uppercase"
              value={calendarDest}
              onChange={(e) => setCalendarDest(e.target.value)}
            />
          </label>
          <button
            onClick={runCalendar}
            disabled={calendarLoading}
            className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-ink dark:text-slate-100 text-sm font-medium px-4 py-2 rounded-lg transition-colors border border-slate-100 dark:border-slate-800 disabled:opacity-50"
          >
            {calendarLoading ? 'Consultando...' : 'Ver calendario'}
          </button>
          {minOfCalendar !== null && minOfCalendar !== undefined && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">Minimo del rango: {minOfCalendar.toFixed(2)}</span>
          )}
        </div>
        {calendarError && <p className="text-red-500 dark:text-red-400 text-xs mt-2">{calendarError}</p>}
        {calendarDays && (
          <div className="mt-3 grid grid-cols-3 md:grid-cols-7 gap-2">
            {calendarDays.map((d) => (
              <div
                key={d.date}
                style={d.minPrice !== null ? heatmapStyle(d.minPrice) : undefined}
                className={`text-center rounded-lg p-2 text-xs border ${
                  d.minPrice === null
                    ? 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-100 dark:border-slate-700'
                    : minOfCalendar !== null && d.minPrice === minOfCalendar
                    ? 'font-semibold ring-2 ring-indigo/60'
                    : 'text-slate-700'
                }`}
              >
                <div>{d.date.slice(5)}</div>
                <div>{d.minPrice !== null ? `${d.minPrice.toFixed(0)} ${d.currency}` : 'Sin datos'}</div>
              </div>
            ))}
          </div>
        )}
        <FreeCalendarPreview origin={originIatas[0] ?? ''} destination={calendarDest.toUpperCase()} />
      </div>

      <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
        <div className="flex items-center gap-2 mb-2">
          <IconBell className="w-4 h-4 text-indigo" />
          <h2 className="text-base font-semibold text-ink dark:text-slate-100">Guardar alerta de precio</h2>
        </div>
        <PushNotificationSetup />
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-2 mt-2">
          Usa los origenes, fechas y destino actuales del buscador de arriba (
          <strong className="text-slate-600 dark:text-slate-300">
            {destinationIatas[0] ?? 'sin destino elegido todavia'}
          </strong>
          ). Fija aqui el precio maximo para ESTA alerta -- puede ser distinto al filtro de precio del buscador.
        </p>
        <div className="flex gap-2 items-end flex-wrap">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Precio maximo total (EUR)
            <input
              type="number"
              min={0}
              placeholder="Ej: 350"
              className="mt-1 w-28 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-lg p-2 text-sm text-ink dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
              value={alertMaxPrice}
              onChange={(e) => setAlertMaxPrice(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Etiqueta (opcional)
            <input
              type="text"
              placeholder="Puente diciembre"
              className="mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-lg p-2 text-sm text-ink dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
              value={alertLabel}
              onChange={(e) => setAlertLabel(e.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Email para avisos (opcional)
            <input
              type="email"
              placeholder="tu@email.com"
              className="mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 rounded-lg p-2 text-sm text-ink dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
              value={alertEmail}
              onChange={(e) => setAlertEmail(e.target.value)}
            />
          </label>
          <button
            onClick={saveAlert}
            disabled={alertSaving}
            className="bg-indigo hover:bg-indigo-dark text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {alertSaving ? 'Guardando...' : 'Guardar alerta con estos filtros'}
          </button>
        </div>
        {alertMessage && <p className="text-xs mt-2 text-slate-500 dark:text-slate-400">{alertMessage}</p>}

        <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Tus alertas guardadas {savedAlerts.length > 0 && `(${savedAlerts.length})`}
            </p>
            <button onClick={loadAlerts} className="text-[11px] text-indigo hover:text-indigo-dark underline">
              Actualizar
            </button>
          </div>
          {alertsLoading && <p className="text-xs text-slate-400 dark:text-slate-500">Cargando...</p>}
          {alertsError && <p className="text-xs text-red-500 dark:text-red-400">{alertsError}</p>}
          {!alertsLoading && savedAlerts.length === 0 && !alertsError && (
            <p className="text-xs text-slate-400 dark:text-slate-500">Todavia no has guardado ninguna alerta.</p>
          )}
          <ul className="space-y-1.5">
            {savedAlerts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink dark:text-slate-100 truncate">
                    {a.origin_iatas.join('/')} → {a.destination_iata ?? '?'}
                    {a.label ? ` · ${a.label}` : ''}
                  </p>
                  <p className="text-slate-400 dark:text-slate-500">
                    {formatDate(a.outbound_date_from)} - {formatDate(a.inbound_date_from)} · limite {Number(a.max_price_total).toFixed(0)} EUR
                    {a.last_min_price !== null && (
                      <>
                        {' '}
                        · minimo visto: {Number(a.last_min_price).toFixed(0)} EUR
                        {a.last_match_found && <span className="text-emerald-600 dark:text-emerald-400 font-semibold"> (match!)</span>}
                      </>
                    )}
                    {a.email && <> · {a.email}</>}
                  </p>
                </div>
                <button
                  onClick={() => deleteAlert(a.id)}
                  disabled={deletingId === a.id}
                  className="text-red-500 hover:text-red-600 dark:text-red-400 shrink-0 disabled:opacity-50"
                  title="Borrar esta alerta"
                >
                  {deletingId === a.id ? '...' : 'Borrar'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
