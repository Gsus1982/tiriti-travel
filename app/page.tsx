'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LiveItinerary } from '@/lib/live-engine';
import { parseSearchQuery } from '@/lib/nlp-search';

type Meta = {
  groups: { id: string; name: string; country: string }[];
  origins: { iata: string; city: string }[];
};

type RealDestination = {
  dest_iata: string;
  dest_name: string;
  country: string;
  served_from: string[];
  last_synced: string | null;
};

type BookingLinksState = Record<string, { provider_name: string; url: string; price?: { amount: number; currency: string } }[]>;

function toggle(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function sortResults(items: LiveItinerary[], sortBy: 'checkout_time' | 'price' | 'duration'): LiveItinerary[] {
  const copy = [...items];
  copy.sort((a: any, b: any) => {
    if (sortBy === 'price') return a.totalPrice - b.totalPrice;
    if (sortBy === 'duration') {
      const da = new Date(a.inbound.arrival_at).getTime() - new Date(a.outbound.departure_at).getTime();
      const db = new Date(b.inbound.arrival_at).getTime() - new Date(b.outbound.departure_at).getTime();
      return da - db;
    }
    return new Date(a.hotelCheckoutAt).getTime() - new Date(b.hotelCheckoutAt).getTime();
  });
  return copy;
}

export default function HomePage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [travelIdeasMode, setTravelIdeasMode] = useState(false);
  const [originIatas, setOriginIatas] = useState<string[]>(['ALC']);
  const [destinationGroupIds, setDestinationGroupIds] = useState<string[]>(['poland']);
  const [selectedDestIatas, setSelectedDestIatas] = useState<string[]>([]);
  const [outboundDateFrom, setOutboundDateFrom] = useState('2026-12-04');
  const [outboundDateTo, setOutboundDateTo] = useState('2026-12-05');
  const [inboundDateFrom, setInboundDateFrom] = useState('2026-12-08');
  const [inboundDateTo, setInboundDateTo] = useState('2026-12-08');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(1);
  const [requireCabinBaggage, setRequireCabinBaggage] = useState(false);
  const [allowOpenJaw, setAllowOpenJaw] = useState(true);
  const [outboundNotBeforeHour, setOutboundNotBeforeHour] = useState<number | ''>('');
  const [inboundNotBeforeHour, setInboundNotBeforeHour] = useState<number | ''>(6);
  const [maxPriceTotal, setMaxPriceTotal] = useState<number | ''>('');
  const [sortBy, setSortBy] = useState<'checkout_time' | 'price' | 'duration'>('checkout_time');
  const [liveResults, setLiveResults] = useState<LiveItinerary[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingLinks, setBookingLinks] = useState<BookingLinksState>({});
  const [loadingLinks, setLoadingLinks] = useState<string | null>(null);

  const [nlpText, setNlpText] = useState('');
  const [nlpWarnings, setNlpWarnings] = useState<string[]>([]);

  const [realDestinations, setRealDestinations] = useState<RealDestination[]>([]);
  const [realDestFilter, setRealDestFilter] = useState('');
  const [showRealDestPanel, setShowRealDestPanel] = useState(false);

  useEffect(() => {
    fetch('/api/meta')
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setError('No se pudo cargar la configuracion inicial.'));
  }, []);

  useEffect(() => {
    if (originIatas.length === 0) {
      setRealDestinations([]);
      return;
    }
    fetch(`/api/destinations?origins=${originIatas.join(',')}`)
      .then((r) => r.json())
      .then((data) => setRealDestinations(data.destinations ?? []))
      .catch(() => setRealDestinations([]));
  }, [originIatas]);

  const combos = originIatas.length * (destinationGroupIds.length + selectedDestIatas.length);

  const filteredRealDestinations = useMemo(() => {
    const q = realDestFilter.trim().toLowerCase();
    if (!q) return realDestinations;
    return realDestinations.filter(
      (d) => d.dest_name.toLowerCase().includes(q) || d.country.toLowerCase().includes(q) || d.dest_iata.toLowerCase().includes(q)
    );
  }, [realDestinations, realDestFilter]);

  function handleInterpret() {
    if (!meta || !nlpText.trim()) return;
    const refDate = new Date(outboundDateFrom || Date.now());
    const parsed = parseSearchQuery(nlpText, meta, { year: refDate.getFullYear(), month: refDate.getMonth() + 1 });

    if (parsed.originIatas.length) setOriginIatas(parsed.originIatas);
    if (parsed.destinationGroupIds.length) setDestinationGroupIds(parsed.destinationGroupIds);
    if (parsed.outboundDateFrom) setOutboundDateFrom(parsed.outboundDateFrom);
    if (parsed.outboundDateTo) setOutboundDateTo(parsed.outboundDateTo);
    if (parsed.inboundDateFrom) setInboundDateFrom(parsed.inboundDateFrom);
    if (parsed.inboundDateTo) setInboundDateTo(parsed.inboundDateTo);
    if (parsed.outboundNotBeforeHour !== undefined) setOutboundNotBeforeHour(parsed.outboundNotBeforeHour);
    if (parsed.inboundNotBeforeHour !== undefined) setInboundNotBeforeHour(parsed.inboundNotBeforeHour);
    setNlpWarnings(parsed.warnings);
  }

  async function runSearch(groupIdsOverride?: string[], iataOverride?: string[]) {
    setLoading(true);
    setError(null);
    setWarnings([]);
    setBookingLinks({});
    const groupIds = groupIdsOverride ?? destinationGroupIds;
    const iatas = iataOverride ?? selectedDestIatas;
    const payload = {
      originIatas,
      destinationGroupIds: groupIds,
      destinationIatas: iatas,
      outboundDateFrom,
      outboundDateTo,
      inboundDateFrom,
      inboundDateTo,
      pax: { adults, children },
      requireCabinBaggage,
      allowOpenJaw,
      outboundNotBeforeHour: outboundNotBeforeHour === '' ? undefined : Number(outboundNotBeforeHour),
      inboundNotBeforeHour: inboundNotBeforeHour === '' ? undefined : Number(inboundNotBeforeHour),
      maxPriceTotal: maxPriceTotal === '' ? undefined : Number(maxPriceTotal),
      sortBy
    };
    try {
      const res = await fetch('/api/search-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido');
      if (data.warnings?.length) setWarnings(data.warnings);
      setLiveResults(sortResults(data.itineraries ?? [], sortBy));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    await runSearch();
  }

  async function handleTravelIdeas() {
    const allGroupIds = (meta?.groups ?? []).map((g) => g.id);
    if (originIatas.length * allGroupIds.length > 6) {
      setError(
        '"Quiero viajar" con todos los destinos supera el limite de 6 combinaciones origen x destino que admite Ignav en modo gratuito. Reduce los origenes seleccionados o desactiva "Quiero viajar" y elige destinos concretos.'
      );
      return;
    }
    setDestinationGroupIds(allGroupIds);
    setSelectedDestIatas([]);
    await runSearch(allGroupIds, []);
  }

  function handleReSort(newSortBy: 'checkout_time' | 'price' | 'duration') {
    setSortBy(newSortBy);
    if (liveResults) setLiveResults(sortResults(liveResults, newSortBy));
  }

  async function handleShowLinks(rowKey: string, ignavId: string) {
    setLoadingLinks(rowKey);
    try {
      const res = await fetch('/api/booking-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ignavId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error obteniendo enlaces');
      const links = (data.booking_options ?? []).flatMap((o: any) => o.links ?? []);
      setBookingLinks((prev) => ({ ...prev, [rowKey]: links }));
    } catch (e: any) {
      setBookingLinks((prev) => ({ ...prev, [rowKey]: [] }));
      setError(e.message);
    } finally {
      setLoadingLinks(null);
    }
  }

  const originsList = meta?.origins ?? [{ iata: 'ALC', city: 'Alicante' }];
  const groupsList = meta?.groups ?? [{ id: 'poland', name: 'Polonia', country: 'Polonia' }];

  return (
    <div className="space-y-8">
      <header className="relative overflow-hidden rounded-2xl bg-[#f4f5f6] px-6 py-10 md:py-16 text-center border border-slate-200">
        <p className="uppercase tracking-[0.3em] text-[11px] text-[#4a7ba6] font-semibold mb-3">Tiriti Travel &middot; buscador familiar</p>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight text-slate-900 leading-[1.05]">
          ENCUENTRA<br />TU VUELO
        </h1>
        <div className="mx-auto mt-4 h-px w-24 bg-[#4a7ba6]" />
        <p className="mt-4 max-w-xl mx-auto text-sm text-slate-500">
          Solo vuelos directos, ida y vuelta, desde ALC, MAD, VLC y RMU. Datos en vivo de Ignav, no estimaciones.
        </p>
      </header>

      <section className="bg-white rounded-xl shadow p-6 space-y-3">
        <h2 className="text-lg font-semibold">Busqueda en lenguaje natural (beta)</h2>
        <p className="text-xs text-slate-500">
          Escribe algo como: "vuelo a Polonia desde Alicante o Valencia, salida el 4 despues de las 18h o si no el 5 a partir de las 8h, regreso no antes de las 12h".
          El sistema precargara los filtros; siempre revisa el resultado antes de buscar.
        </p>
        <textarea
          className="w-full border rounded p-2 text-sm"
          rows={2}
          value={nlpText}
          onChange={(e) => setNlpText(e.target.value)}
          placeholder="Describe tu busqueda en una frase..."
        />
        <button
          onClick={handleInterpret}
          className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
        >
          Interpretar y precargar filtros
        </button>
        {nlpWarnings.length > 0 && (
          <div className="text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded p-2">
            <p className="font-medium mb-1">Como se ha interpretado (revisa antes de buscar):</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {nlpWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl shadow p-6 space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <h2 className="text-lg font-semibold">Filtros de busqueda</h2>
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            Datos en vivo (Ignav)
          </span>
          <label className="flex items-center gap-2 text-sm ml-auto">
            <input type="checkbox" checked={travelIdeasMode} onChange={(e) => setTravelIdeasMode(e.target.checked)} />
            Modo "Quiero viajar, propon ideas"
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium mb-1">Origenes (elige uno o varios)</p>
            <div className="flex flex-wrap gap-2">
              {originsList.map((o) => (
                <label
                  key={o.iata}
                  className={`text-xs px-2 py-1 rounded border cursor-pointer ${originIatas.includes(o.iata) ? 'bg-[#4a7ba6] text-white border-[#4a7ba6]' : 'bg-white border-slate-300'}`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={originIatas.includes(o.iata)}
                    onChange={() => setOriginIatas((prev) => toggle(prev, o.iata))}
                  />
                  {o.city} ({o.iata})
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowRealDestPanel((v) => !v)}
              className="mt-2 text-xs text-[#4a7ba6] underline"
            >
              {showRealDestPanel ? 'Ocultar' : 'Elegir de'} los {realDestinations.length} destinos reales disponibles desde estos origenes
            </button>
          </div>
          <div>
            <p className="text-sm font-medium mb-1">Destinos: grupos con evento/temporada curados</p>
            <div className={`flex flex-wrap gap-2 ${travelIdeasMode ? 'opacity-40 pointer-events-none' : ''}`}>
              {groupsList.map((g) => (
                <label
                  key={g.id}
                  className={`text-xs px-2 py-1 rounded border cursor-pointer ${destinationGroupIds.includes(g.id) ? 'bg-[#4a7ba6] text-white border-[#4a7ba6]' : 'bg-white border-slate-300'}`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={destinationGroupIds.includes(g.id)}
                    onChange={() => setDestinationGroupIds((prev) => toggle(prev, g.id))}
                  />
                  {g.name}
                </label>
              ))}
            </div>
            {selectedDestIatas.length > 0 && (
              <p className="text-xs text-slate-500 mt-2">
                + {selectedDestIatas.length} destino(s) suelto(s) elegido(s) abajo: {selectedDestIatas.join(', ')}
              </p>
            )}
            {travelIdeasMode && (
              <p className="text-xs text-slate-500 mt-1">
                En modo "Quiero viajar" se buscan TODOS los grupos curados con tus filtros; no hace falta elegir uno.
              </p>
            )}
          </div>
        </div>

        {showRealDestPanel && (
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
            <p className="text-xs text-slate-600">
              Union real de destinos con vuelo directo desde {originIatas.join(', ') || '(elige origenes)'}, segun la ultima
              sincronizacion con Aena. Marca los que quieras incluir en la busqueda (ademas o en vez de los grupos curados).
            </p>
            <input
              type="text"
              placeholder="Filtrar por ciudad, pais o IATA..."
              className="w-full border rounded p-2 text-xs"
              value={realDestFilter}
              onChange={(e) => setRealDestFilter(e.target.value)}
            />
            <div className="max-h-56 overflow-y-auto grid grid-cols-2 md:grid-cols-3 gap-1 text-xs">
              {filteredRealDestinations.map((d) => (
                <label
                  key={d.dest_iata}
                  className={`px-2 py-1 rounded border cursor-pointer ${selectedDestIatas.includes(d.dest_iata) ? 'bg-[#4a7ba6] text-white border-[#4a7ba6]' : 'bg-white border-slate-200'}`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={selectedDestIatas.includes(d.dest_iata)}
                    onChange={() => setSelectedDestIatas((prev) => toggle(prev, d.dest_iata))}
                  />
                  <span className="font-medium">{d.dest_name}</span> ({d.dest_iata})
                  <br />
                  <span className={selectedDestIatas.includes(d.dest_iata) ? 'text-white/80' : 'text-slate-400'}>
                    {d.country} &middot; desde {d.served_from.join(', ')}
                  </span>
                </label>
              ))}
              {filteredRealDestinations.length === 0 && (
                <p className="text-slate-400 col-span-full">Sin resultados o cache aun no sincronizada.</p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="col-span-2 grid grid-cols-2 gap-2">
            <label className="text-sm">
              Ida desde
              <input type="date" className="mt-1 w-full border rounded p-2" value={outboundDateFrom} onChange={(e) => setOutboundDateFrom(e.target.value)} />
            </label>
            <label className="text-sm">
              Ida hasta
              <input type="date" className="mt-1 w-full border rounded p-2" value={outboundDateTo} onChange={(e) => setOutboundDateTo(e.target.value)} />
            </label>
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-2">
            <label className="text-sm">
              Vuelta desde
              <input type="date" className="mt-1 w-full border rounded p-2" value={inboundDateFrom} onChange={(e) => setInboundDateFrom(e.target.value)} />
            </label>
            <label className="text-sm">
              Vuelta hasta
              <input type="date" className="mt-1 w-full border rounded p-2" value={inboundDateTo} onChange={(e) => setInboundDateTo(e.target.value)} />
            </label>
          </div>
          <label className="text-sm">
            Adultos
            <input type="number" min={1} className="mt-1 w-full border rounded p-2" value={adults} onChange={(e) => setAdults(Number(e.target.value))} />
          </label>
          <label className="text-sm">
            Ninos
            <input type="number" min={0} className="mt-1 w-full border rounded p-2" value={children} onChange={(e) => setChildren(Number(e.target.value))} />
          </label>
          <label className="text-sm">
            Ida no antes de (hora)
            <input
              type="number"
              min={0}
              max={23}
              className="mt-1 w-full border rounded p-2"
              value={outboundNotBeforeHour}
              onChange={(e) => setOutboundNotBeforeHour(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            Vuelta no antes de (hora)
            <input
              type="number"
              min={0}
              max={23}
              className="mt-1 w-full border rounded p-2"
              value={inboundNotBeforeHour}
              onChange={(e) => setInboundNotBeforeHour(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            Precio max. total
            <input type="number" min={0} className="mt-1 w-full border rounded p-2" value={maxPriceTotal} onChange={(e) => setMaxPriceTotal(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-sm">
            Ordenar por
            <select className="mt-1 w-full border rounded p-2" value={sortBy} onChange={(e) => handleReSort(e.target.value as any)}>
              <option value="checkout_time">Hora salida hotel (mejor primero)</option>
              <option value="price">Precio total</option>
              <option value="duration">Duracion total de vuelo</option>
            </select>
          </label>
          <label className="text-sm flex items-center gap-2 mt-6">
            <input type="checkbox" checked={requireCabinBaggage} onChange={(e) => setRequireCabinBaggage(e.target.checked)} />
            Exigir equipaje de mano incluido
          </label>
          <label className="text-sm flex items-center gap-2 mt-6">
            <input type="checkbox" checked={allowOpenJaw} onChange={(e) => setAllowOpenJaw(e.target.checked)} />
            Permitir open-jaw en destino
          </label>
        </div>

        {!travelIdeasMode && (
          <p className="text-xs text-slate-500">
            Combinaciones origen x destino seleccionadas: <strong>{combos}</strong>
            {combos > 6 && <span className="text-red-600"> (maximo 6 en Ignav; reduce la seleccion)</span>}
          </p>
        )}
        <p className="text-xs text-amber-600">
          El rango maximo por tramo (ida o vuelta) es de 5 dias y el maximo de combinaciones origen x destino es 6, para no agotar la cuota gratuita de Ignav.
        </p>

        <div className="flex gap-3">
          <button
            onClick={travelIdeasMode ? handleTravelIdeas : handleSearch}
            disabled={loading || originIatas.length === 0 || (!travelIdeasMode && destinationGroupIds.length === 0 && selectedDestIatas.length === 0)}
            className="bg-[#4a7ba6] hover:bg-[#3d6a91] text-white font-medium px-5 py-2 rounded-lg disabled:opacity-50"
          >
            {loading ? 'Buscando...' : travelIdeasMode ? 'Proponme ideas de viaje' : 'Buscar vuelos'}
          </button>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {warnings.length > 0 && (
          <div className="text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded p-3">
            <p className="font-medium mb-1">Avisos de la busqueda:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {liveResults && (
        <section className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Resultados ({liveResults.length})</h2>
            <select className="border rounded p-1 text-xs" value={sortBy} onChange={(e) => handleReSort(e.target.value as any)}>
              <option value="checkout_time">Ordenar: hora salida hotel</option>
              <option value="price">Ordenar: precio total</option>
              <option value="duration">Ordenar: duracion total</option>
            </select>
          </div>
          {liveResults.length === 0 && <p className="text-sm text-slate-500">Sin itinerarios directos que cumplan los filtros para estas fechas. Revisa los avisos de arriba para saber el motivo exacto.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Ruta</th>
                  <th className="p-2">Ida</th>
                  <th className="p-2">Vuelta</th>
                  <th className="p-2">Open-jaw</th>
                  <th className="p-2">Precio total</th>
                  <th className="p-2">Salida hotel</th>
                  <th className="p-2">Notas</th>
                  <th className="p-2">Reserva</th>
                </tr>
              </thead>
              <tbody>
                {liveResults.map((r, i) => {
                  const rowKey = `${r.outbound.ignav_id}-${r.inbound.ignav_id}`;
                  return (
                    <tr key={rowKey} className="border-b align-top">
                      <td className="p-2 font-medium">
                        {r.originIata} to {r.destinationGroupName}
                        {r.isSingleIataTarget && <span className="ml-1 text-[10px] text-slate-400">(destino suelto)</span>}
                      </td>
                      <td className="p-2">{r.outbound.airline} {r.outbound.flight_number}<br />{r.outbound.origin_iata} to {r.outbound.destination_iata}<br />{new Date(r.outbound.departure_at).toLocaleString('es-ES')}</td>
                      <td className="p-2">{r.inbound.airline} {r.inbound.flight_number}<br />{r.inbound.origin_iata} to {r.inbound.destination_iata}<br />{new Date(r.inbound.departure_at).toLocaleString('es-ES')}</td>
                      <td className="p-2">{r.isOpenJaw ? 'Si' : 'No'}</td>
                      <td className="p-2 font-medium">{r.totalPrice.toFixed(2)} {r.currency}</td>
                      <td className="p-2">{new Date(r.hotelCheckoutAt).toLocaleString('es-ES')}</td>
                      <td className="p-2 text-slate-600">{r.notes.join(' ')}</td>
                      <td className="p-2">
                        <button
                          className="text-[#4a7ba6] underline text-xs"
                          onClick={() => handleShowLinks(rowKey, r.outbound.ignav_id)}
                          disabled={loadingLinks === rowKey}
                        >
                          {loadingLinks === rowKey ? 'Cargando...' : 'Ver enlaces ida'}
                        </button>
                        {bookingLinks[rowKey] && (
                          <ul className="mt-1 space-y-1">
                            {bookingLinks[rowKey].map((link, j) => (
                              <li key={j}>
                                <a href={link.url} target="_blank" rel="noreferrer" className="text-xs text-[#4a7ba6] underline">
                                  {link.provider_name} {link.price ? `(${link.price.amount} ${link.price.currency})` : ''}
                                </a>
                              </li>
                            ))}
                            {bookingLinks[rowKey].length === 0 && <li className="text-xs text-slate-400">Sin enlaces disponibles</li>}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-slate-400">
        Todos los resultados provienen de la API de Ignav en tiempo real. Cada dia adicional en el rango de fechas y cada
        combinacion origen x destino consume peticiones de la cuota gratuita.<br />
        El listado de "destinos reales disponibles" se sincroniza automaticamente cada dia contra los datos publicos de Aena;
        ahora puedes elegir cualquiera de ellos y buscar itinerarios completos, no solo los grupos curados.
      </p>
    </div>
  );
}
