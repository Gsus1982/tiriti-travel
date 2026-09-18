'use client';

import { useState } from 'react';
import { IconChevronDown } from './Icons';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Calendario propio en React puro -- NO usa <input type="date"> nativo. Se construyo
 * asi a proposito tras un bug real reportado: 2 inputs de fecha nativos controlando la
 * misma variable de estado se pisaban entre si en iOS (el picker de rueda nativo
 * mantiene su propio estado interno que puede desincronizarse al re-renderizar por
 * otro input observando el mismo valor). Con un calendario 100% controlado por React,
 * ese problema no puede pasar. Ademas permite justo lo que se pedia: dias sueltos
 * seleccionables de forma independiente, no un rango obligatoriamente simetrico.
 */
export default function DayPicker({
  selectedDays,
  onToggleDay,
  minDate
}: {
  selectedDays: string[];
  onToggleDay: (date: string) => void;
  minDate?: string;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Lunes = 0 ... Domingo = 6 (getDay() nativo es Domingo=0, se reindexa)
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;

  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  function goPrevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }
  function goNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={goPrevMonth} aria-label="Mes anterior" className="p-1 text-slate-400 hover:text-indigo">
          <IconChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <p className="text-xs font-medium text-ink dark:text-slate-100">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </p>
        <button type="button" onClick={goNextMonth} aria-label="Mes siguiente" className="p-1 text-slate-400 hover:text-indigo">
          <IconChevronDown className="w-4 h-4 -rotate-90" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[10px] text-slate-400 dark:text-slate-500 py-1">
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`b${i}`} />;
          const iso = toIso(viewYear, viewMonth, day);
          const isSelected = selectedDays.includes(iso);
          const isPast = minDate ? iso < minDate : false;
          return (
            <button
              type="button"
              key={iso}
              disabled={isPast}
              onClick={() => onToggleDay(iso)}
              className={`text-xs rounded-lg py-1.5 transition-colors ${
                isPast
                  ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                  : isSelected
                  ? 'bg-indigo text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
