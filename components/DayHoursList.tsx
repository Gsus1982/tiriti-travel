'use client';

export type DayHours = { before?: number; after?: number };

export default function DayHoursList({
  selectedDays,
  dayHours,
  onChangeHour
}: {
  selectedDays: string[];
  dayHours: Record<string, DayHours>;
  onChangeHour: (date: string, field: 'before' | 'after', value: number | undefined) => void;
}) {
  if (selectedDays.length === 0) {
    return <p className="text-[11px] text-slate-400 dark:text-slate-500">Elige uno o varios dias en el calendario de arriba.</p>;
  }

  return (
    <div className="space-y-1.5">
      {[...selectedDays].sort().map((date) => {
        const h = dayHours[date] ?? {};
        return (
          <div key={date} className="flex items-center gap-2 text-[11px]">
            <span className="w-16 shrink-0 text-slate-500 dark:text-slate-400">
              {new Date(`${date}T00:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
            </span>
            <span className="text-slate-400 dark:text-slate-500">desde</span>
            <input
              type="number"
              min={0}
              max={23}
              placeholder="0h"
              value={h.before ?? ''}
              onChange={(e) => onChangeHour(date, 'before', e.target.value === '' ? undefined : Number(e.target.value))}
              className="w-12 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-1 text-center text-ink dark:text-slate-100"
            />
            <span className="text-slate-400 dark:text-slate-500">hasta</span>
            <input
              type="number"
              min={0}
              max={23}
              placeholder="24h"
              value={h.after ?? ''}
              onChange={(e) => onChangeHour(date, 'after', e.target.value === '' ? undefined : Number(e.target.value))}
              className="w-12 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-1 text-center text-ink dark:text-slate-100"
            />
          </div>
        );
      })}
    </div>
  );
}
