import { NextRequest, NextResponse } from 'next/server';
import { searchLiveItineraries, type LiveFilters } from '@/lib/live-engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Body = Partial<Omit<LiveFilters, 'originIatas' | 'destinationGroupIds'>> & {
  originIatas?: string[];
  originIata?: string;
  destinationGroupIds?: string[];
  destinationGroupId?: string;
  outboundDate?: string;
  inboundDate?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;

    const originIatas = body.originIatas ?? (body.originIata ? [body.originIata] : undefined);
    const destinationGroupIds = body.destinationGroupIds ?? (body.destinationGroupId ? [body.destinationGroupId] : undefined);
    const outboundDateFrom = body.outboundDateFrom ?? body.outboundDate;
    const inboundDateFrom = body.inboundDateFrom ?? body.inboundDate;

    if (!originIatas?.length || !destinationGroupIds?.length || !outboundDateFrom || !inboundDateFrom) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: originIatas, destinationGroupIds, outboundDateFrom, inboundDateFrom' },
        { status: 400 }
      );
    }

    const filters: LiveFilters = {
      originIatas,
      destinationGroupIds,
      outboundDateFrom,
      outboundDateTo: body.outboundDateTo ?? outboundDateFrom,
      inboundDateFrom,
      inboundDateTo: body.inboundDateTo ?? inboundDateFrom,
      pax: body.pax ?? { adults: 2, children: 1 },
      requireCabinBaggage: body.requireCabinBaggage ?? false,
      allowOpenJaw: body.allowOpenJaw ?? true,
      outboundNotBeforeHour: body.outboundNotBeforeHour,
      inboundNotBeforeHour: body.inboundNotBeforeHour,
      maxPriceTotal: body.maxPriceTotal,
      airlinesInclude: body.airlinesInclude,
      airlinesExclude: body.airlinesExclude,
      sortBy: body.sortBy ?? 'checkout_time'
    };

    const { itineraries, warnings } = await searchLiveItineraries(filters);
    return NextResponse.json({ count: itineraries.length, itineraries, warnings });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Error interno en busqueda en vivo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
