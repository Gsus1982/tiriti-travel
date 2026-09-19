'use client';

import { useEffect, useState } from 'react';
import { IconSparkles } from './Icons';

type ClimateHint = { avgMinC: number; avgMaxC: number; avgPrecipMm: number };
type FreeInfo = {
  wiki: { extract: string; url: string } | null;
  country: { languages: string[]; drivingSide: 'left' | 'right' | null; capital: string | null } | null;
  plugNote: string | null;
};

export default function DestinationTipsButton({
  destinationName,
  country,
  countryIso2,
  month,
  climate,
  childrenCount
}: {
  destinationName: string;
  country: string;
  countryIso2?: string | null;
  month: number;
  climate?: ClimateHint | null;
  childrenCount?: number;
}) {
  const [freeInfo, setFreeInfo] = useState<FreeInfo | null>(null);
  const [tips, setTips] = useState<{ whatToSee: string; whatToPack: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // La ficha gratis (Wikipedia + pais) se carga sola -- es gratis e instantanea, no
  // hay razon para esconderla detras de un boton como el consejo de la IA (que si
  // gasta tokens de verdad).
  useEffect(() => {
    fetch('/api/destination-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinationName, countryIso2 })
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setFreeInfo)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationName, countryIso2]);

  async function fetchAiTips() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-destination-tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinationName, country, month, climate, childrenCount })
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

  return (
    <div className="mt-2 space-y-2">
      {freeInfo?.wiki && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400">
          <p>{freeInfo.wiki.extract}</p>
          <a href={freeInfo.wiki.url} target="_blank" rel="noreferrer" className="text-indigo underline">
            Wikipedia
          </a>
        </div>
      )}
      {freeInfo?.country && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {freeInfo.country.capital && <>Capital: {freeInfo.country.capital}. </>}
          {freeInfo.country.languages.length > 0 && <>Idioma: {freeInfo.country.languages.join(', ')}. </>}
          {freeInfo.country.drivingSide === 'left' && <>Se conduce por la izquierda. </>}
          {freeInfo.plugNote && <>Enchufe {freeInfo.plugNote}.</>}
        </p>
      )}

      {tips ? (
        <div className="text-[11px] text-indigo-dark dark:text-indigo-light bg-indigo-pale dark:bg-indigo-950 rounded-lg p-2 space-y-1">
          <p>
            <IconSparkles className="w-3 h-3 inline mr-1" />
            {tips.whatToSee}
          </p>
          <p className="text-slate-500 dark:text-slate-400">🧳 {tips.whatToPack}</p>
        </div>
      ) : (
        <div>
          <button onClick={fetchAiTips} disabled={loading} className="flex items-center gap-1 text-[11px] text-indigo hover:text-indigo-dark font-medium">
            <IconSparkles className="w-3 h-3" />
            {loading ? 'Pensando...' : 'Consejo de la IA sobre este destino'}
          </button>
          {error && <p className="text-[10px] text-red-500 dark:text-red-400 mt-1">{error}</p>}
        </div>
      )}
    </div>
  );
}
