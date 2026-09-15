'use client';

import { useEffect, useState } from 'react';
import { getSearchHistory, clearSearchHistory, type SearchHistoryEntry } from '@/lib/search-history';
import { IconClock } from './Icons';

export default function SearchHistoryPanel({ onRestore }: { onRestore: (url: string) => void }) {
  const [entries, setEntries] = useState<SearchHistoryEntry[]>([]);

  // Se lee en el cliente tras montar (localStorage no existe en el render de servidor).
  useEffect(() => {
    setEntries(getSearchHistory());
    const onUpdate = () => setEntries(getSearchHistory());
    window.addEventListener('tiriti:search-history-updated', onUpdate);
    return () => window.removeEventListener('tiriti:search-history-updated', onUpdate);
  }, []);

  if (entries.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <IconClock className="w-4 h-4 text-indigo" />
          <h2 className="text-sm font-semibold text-ink dark:text-slate-100">Busquedas recientes</h2>
        </div>
        <button
          onClick={() => {
            clearSearchHistory();
            setEntries([]);
          }}
          className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
        >
          Borrar
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {entries.map((e) => (
          <button
            key={e.url}
            onClick={() => onRestore(e.url)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo/60 hover:text-indigo transition-colors"
            title={new Date(e.savedAt).toLocaleString('es-ES')}
          >
            {e.label}
          </button>
        ))}
      </div>
    </div>
  );
}
