import { NextRequest, NextResponse } from 'next/server';
import { searchLiveItineraries, type LiveFilters } from '@/lib/live-engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<LiveFilters>;
    if (!body.originIata || !body.destinationGroupId || !body.outboundDate || !body.inboundDate) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: originIata, destinationGroupId, outboundDate, inboundDate' },
        { status: 400 }
      );
    }
    const filters: LiveFilters = {
      originIata: body.originIata,
      destinationGroupId: body.destinationGroupId,
      outboundDate: body.outboundDate,
      inboundDate: body.inboundDate,
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
    const itineraries = await searchLiveItineraries(filters);
    return NextResponse.json({ count: itineraries.length, itineraries });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Error interno en busqueda en vivo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
