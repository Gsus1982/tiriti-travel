// Serializa/deserializa los filtros de busqueda en la query string de la URL. Usado
// tanto para el enlace "Compartir esta busqueda" como para restaurar una entrada del
// historial guardado en localStorage -- ambos comparten el mismo formato de URL.

export type ShareableFilters = {
  originIatas: string[];
  selectedDestIatas: string[];
  outboundDateFrom: string;
  outboundDateTo: string;
  inboundDateFrom: string;
  inboundDateTo: string;
  adults: number;
  children: number;
  maxPriceTotal: number | '';
  sortBy: 'checkout_time' | 'price' | 'duration';
  requireCabinBaggage: boolean;
  allowOpenJaw: boolean;
  includeSkyScanner: boolean;
  outboundNotBeforeHour: number | '';
  inboundNotBeforeHour: number | '';
  excludeIatasText: string;
  airlinesIncludeText: string;
  airlinesExcludeText: string;
};

// Claves cortas a proposito -- es una URL para compartir (por ejemplo pegada en Notas
// del iPhone), no una API interna.
export function buildShareUrl(f: ShareableFilters): string {
  const params = new URLSearchParams();
  if (f.originIatas.length) params.set('o', f.originIatas.join(','));
  if (f.selectedDestIatas.length) params.set('di', f.selectedDestIatas.join(','));
  params.set('of', f.outboundDateFrom);
  params.set('ot', f.outboundDateTo);
  params.set('if', f.inboundDateFrom);
  params.set('it', f.inboundDateTo);
  params.set('ad', String(f.adults));
  params.set('ch', String(f.children));
  if (f.maxPriceTotal !== '') params.set('mp', String(f.maxPriceTotal));
  params.set('sb', f.sortBy);
  if (f.requireCabinBaggage) params.set('cb', '1');
  if (f.allowOpenJaw) params.set('oj', '1');
  if (f.includeSkyScanner) params.set('sky', '1');
  if (f.outboundNotBeforeHour !== '') params.set('oh', String(f.outboundNotBeforeHour));
  if (f.inboundNotBeforeHour !== '') params.set('ih', String(f.inboundNotBeforeHour));
  if (f.excludeIatasText.trim()) params.set('ex', f.excludeIatasText.trim());
  if (f.airlinesIncludeText.trim()) params.set('ai', f.airlinesIncludeText.trim());
  if (f.airlinesExcludeText.trim()) params.set('ae', f.airlinesExcludeText.trim());

  const base = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
  return `${base}?${params.toString()}`;
}

export function parseShareParams(search: string): Partial<ShareableFilters> {
  const params = new URLSearchParams(search);
  const result: Partial<ShareableFilters> = {};

  const csv = (key: string) => {
    const v = params.get(key);
    return v ? v.split(',').filter(Boolean) : undefined;
  };
  const num = (key: string) => {
    const v = params.get(key);
    return v !== null && v !== '' ? Number(v) : undefined;
  };

  const originIatas = csv('o');
  if (originIatas) result.originIatas = originIatas;
  const selectedDestIatas = csv('di');
  if (selectedDestIatas) result.selectedDestIatas = selectedDestIatas;

  if (params.has('of')) result.outboundDateFrom = params.get('of')!;
  if (params.has('ot')) result.outboundDateTo = params.get('ot')!;
  if (params.has('if')) result.inboundDateFrom = params.get('if')!;
  if (params.has('it')) result.inboundDateTo = params.get('it')!;

  const adults = num('ad');
  if (adults !== undefined) result.adults = adults;
  const children = num('ch');
  if (children !== undefined) result.children = children;
  const maxPriceTotal = num('mp');
  if (maxPriceTotal !== undefined) result.maxPriceTotal = maxPriceTotal;

  const sortBy = params.get('sb');
  if (sortBy === 'checkout_time' || sortBy === 'price' || sortBy === 'duration') result.sortBy = sortBy;

  if (params.has('cb')) result.requireCabinBaggage = params.get('cb') === '1';
  if (params.has('oj')) result.allowOpenJaw = params.get('oj') === '1';
  if (params.has('sky')) result.includeSkyScanner = params.get('sky') === '1';

  const outboundNotBeforeHour = num('oh');
  if (outboundNotBeforeHour !== undefined) result.outboundNotBeforeHour = outboundNotBeforeHour;
  const inboundNotBeforeHour = num('ih');
  if (inboundNotBeforeHour !== undefined) result.inboundNotBeforeHour = inboundNotBeforeHour;

  if (params.has('ex')) result.excludeIatasText = params.get('ex')!;
  if (params.has('ai')) result.airlinesIncludeText = params.get('ai')!;
  if (params.has('ae')) result.airlinesExcludeText = params.get('ae')!;

  return result;
}

/** Etiqueta corta y legible para mostrar en el historial de busquedas. */
export function summarizeFilters(f: ShareableFilters, destinationLabel: string): string {
  const origins = f.originIatas.join('+') || '?';
  const dates = f.outboundDateFrom === f.outboundDateTo ? f.outboundDateFrom.slice(5) : `${f.outboundDateFrom.slice(5)}-${f.outboundDateTo.slice(5)}`;
  return `${origins} -> ${destinationLabel || '?'} (${dates})`;
}
