import { NextRequest, NextResponse } from 'next/server';
import { searchItineraries } from '@/lib/search-engine';
import type { SearchFilters } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<SearchFilters> & { outboundDate?: string; inboundDate?: string };

    const outboundDateFrom = body.outboundDateFrom ?? body.outboundDate;
    const inboundDateFrom = body.inboundDateFrom ?? body.inboundDate;

    if (!body.originIata || !body.destinationGroupId || !outboundDateFrom || !inboundDateFrom) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: originIata, destinationGroupId, outboundDateFrom, inboundDateFrom' },
        { status: 400 }
      );
    }

    const filters: SearchFilters = {
      originIata: body.originIata,
      destinationGroupId: body.destinationGroupId,
      outboundDateFrom,
      outboundDateTo: body.outboundDateTo ?? outboundDateFrom,
      inboundDateFrom,
      inboundDateTo: body.inboundDateTo ?? inboundDateFrom,
      pax: body.pax ?? { adults: 2, children: 1 },
      requireDirect: true,
      requireCabinBaggage: body.requireCabinBaggage ?? false,
      allowOpenJaw: body.allowOpenJaw ?? true,
      outboundNotBeforeHour: body.outboundNotBeforeHour,
      inboundNotBeforeHour: body.inboundNotBeforeHour,
      maxPriceTotal: body.maxPriceTotal,
      airlinesInclude: body.airlinesInclude,
      airlinesExclude: body.airlinesExclude,
      sortBy: body.sortBy ?? 'checkout_time'
    };

    const itineraries = await searchItineraries(filters);
    return NextResponse.json({ count: itineraries.length, itineraries });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Error interno buscando itinerarios';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
