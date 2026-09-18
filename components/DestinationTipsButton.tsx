'use client';

import { useState } from 'react';
import { IconSparkles } from './Icons';

export default function DestinationTipsButton({
  destinationName,
  country,
  month
}: {
  destinationName: string;
  country: string;
  month: number;
}) {
  const [tips, setTips] = useState<{ whatToSee: string; whatToPack: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchTips() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-destination-tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationName, country, month })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No disponible ahora mismo');
      setTips(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (tips) {
    return (
      <div className="mt-2 text-[11px] text-indigo-dark dark:text-indigo-light bg-indigo-pale dark:bg-indigo-950 rounded-lg p-2 space-y-1">
        <p>
          <IconSparkles className="w-3 h-3 inline mr-1" />
          {tips.whatToSee}
        </p>
        <p className="text-slate-500 dark:text-slate-400">🧳 {tips.whatToPack}</p>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        onClick={fetchTips}
        disabled={loading}
        className="flex items-center gap-1 text-[11px] text-indigo hover:text-indigo-dark font-medium"
      >
        <IconSparkles className="w-3 h-3" />
        {loading ? 'Pensando...' : 'Consejo de la IA sobre este destino'}
      </button>
      {error && <p className="text-[10px] text-red-500 dark:text-red-400 mt-1">{error}</p>}
    </div>
  );
}
