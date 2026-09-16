'use client';

import { useState } from 'react';
import { IconCalendar, IconBell } from './Icons';

type CalendarDay = { date: string; minPrice: number | null; currency: string | null; flightCount: number };

export default function ToolsPanel({
  originIatas,
  destinationGroupIds,
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
  destinationGroupIds: string[];
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

  const [alertLabel, setAlertLabel] = useState('');
  const [alertEmail, setAlertEmail] = useState('');
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

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
    // FIX: el backend (app/api/alerts) ya no acepta destinationGroupId -- la tabla real
    // en Neon nunca tuvo esa columna, solo admite un destino real concreto
    // (destinationIata). Si el usuario solo tiene un grupo curado seleccionado y ningun
    // destino real suelto, avisamos en vez de mandar una peticion que va a fallar.
    const destinationIata = destinationIatas[0] ?? null;
    if (!maxPriceTotal) {
      setAlertMessage('Indica un precio maximo total para poder guardar la alerta.');
      return;
    }
    if (!destinationIata) {
      setAlertMessage(
        'Elige al menos un destino real (no un grupo curado) en el buscador para poder guardar la alerta -- las alertas solo funcionan sobre destinos con vuelo directo verificado.'
      );
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
          destinationIata,
          outboundDateFrom,
          outboundDateTo,
          inboundDateFrom,
          inboundDateTo,
          adults,
          children,
          maxPriceTotal,
          label: alertLabel || null,
          email: alertEmail || null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
      setAlertMessage(
        alertEmail
          ? 'Alerta guardada. Un cron diario comprobara el precio y te avisara por email si baja de tu limite.'
          : 'Alerta guardada. Un cron diario comprobara el precio (sin email, no lo has indicado, solo se guardara en el panel).'
      );
    } catch (e: any) {
      setAlertMessage(`Error: ${e.message}`);
    } finally {
      setAlertSaving(false);
    }
  }

  const minOfCalendar = calendarDays?.reduce<number | null>((min, d) => {
    if (d.minPrice === null) return min;
    if (min === null || d.minPrice < min) return d.minPrice;
    return min;
  }, null);

  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <IconCalendar className="w-4 h-4 text-indigo" />
          <h2 className="text-base font-semibold text-ink dark:text-slate-100">Calendario de precios (un solo tramo)</h2>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
          Precio minimo por dia entre las fechas de ida seleccionadas arriba, para el primer origen elegido. Maximo 14 dias
          por consulta (limite de cuota Ignav).
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
                className={`text-center rounded-lg p-2 text-xs border ${
                  d.minPrice === null
                    ? 'bg-slate-50 text-slate-400 border-slate-100'
                    : minOfCalendar !== null && d.minPrice === minOfCalendar
                    ? 'bg-indigo/10 border-indigo/50 text-indigo font-semibold'
                    : 'bg-slate-50 border-slate-100 text-slate-600'
                }`}
              >
                <div>{d.date.slice(5)}</div>
                <div>{d.minPrice !== null ? `${d.minPrice.toFixed(0)} ${d.currency}` : 'Sin datos'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
        <div className="flex items-center gap-2 mb-2">
          <IconBell className="w-4 h-4 text-indigo" />
          <h2 className="text-base font-semibold text-ink dark:text-slate-100">Guardar alerta de precio</h2>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
          Usa los filtros actuales del buscador (origenes, fechas, destino real, precio maximo) y guarda una alerta. Un
          cron diario comprobara si baja el precio; si dejas tu email, te avisaremos ahi en cuanto encuentre uno por
          debajo de tu limite (maximo un aviso cada 24h por alerta).
        </p>
        <div className="flex gap-2 items-end flex-wrap">
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
              placeholder="tucorreo@ejemplo.com"
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
      </div>
    </section>
  );
}
