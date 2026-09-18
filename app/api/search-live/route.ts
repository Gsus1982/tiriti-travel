import { NextRequest, NextResponse } from 'next/server';
import { searchLiveItineraries, type LiveFilters, type LiveItinerary } from '@/lib/live-engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = Partial<Omit<LiveFilters, 'originIatas'>> & {
  originIatas?: string[];
  destinationIatas?: string[];
  destinationIata?: string;
  excludeIatas?: string[];
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;

    const originIatas = body.originIatas ?? [];
    const destinationIatas = body.destinationIatas ?? (body.destinationIata ? [body.destinationIata] : []);
    const excludeIatas = (body.excludeIatas ?? []).map((s) => s.toUpperCase());
    const { outboundDateFrom, outboundDateTo, inboundDateFrom, inboundDateTo } = body;

    if (!originIatas?.length || !destinationIatas?.length || !outboundDateFrom || !inboundDateFrom) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: originIatas, destinationIatas, outboundDateFrom, inboundDateFrom' },
        { status: 400 }
      );
    }

    const filters: LiveFilters = {
      originIatas,
      destinationIatas,
      outboundDateFrom,
      outboundDateTo: outboundDateTo ?? outboundDateFrom,
      inboundDateFrom,
      inboundDateTo: inboundDateTo ?? inboundDateFrom,
      pax: body.pax ?? { adults: 2, children: 1 },
      requireCabinBaggage: body.requireCabinBaggage ?? false,
      allowOpenJaw: body.allowOpenJaw ?? true,
      outboundNotBeforeHour: body.outboundNotBeforeHour,
      inboundNotBeforeHour: body.inboundNotBeforeHour,
      outboundNotAfterHour: body.outboundNotAfterHour,
      inboundNotAfterHour: body.inboundNotAfterHour,
      maxPriceTotal: body.maxPriceTotal,
      airlinesInclude: body.airlinesInclude,
      airlinesExclude: body.airlinesExclude,
      sortBy: body.sortBy ?? 'price',
      includeSkyScanner: body.includeSkyScanner ?? false
    } as LiveFilters;

    const { itineraries: rawItineraries, warnings } = await searchLiveItineraries(filters);

    // Nuevo: filtro de exclusion de ciudades/aeropuertos, aplicado sobre el resultado ya
    // devuelto por el motor. No requiere tocar lib/live-engine.ts.
    const itineraries = excludeIatas.length
      ? rawItineraries.filter((it: LiveItinerary) => {
          const outboundDest = it.outbound?.destination_iata;
          const inboundOrigin = it.inbound?.origin_iata;
          return !excludeIatas.includes(outboundDest) && !excludeIatas.includes(inboundOrigin);
        })
      : rawItineraries;

    return NextResponse.json({ count: itineraries.length, itineraries, warnings });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Error interno en busqueda en vivo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
