import { NextRequest, NextResponse } from 'next/server';
import { searchItineraries } from '@/lib/search-engine';
import type { SearchFilters } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<SearchFilters>;

    if (!body.originIata || !body.destinationGroupId || !body.outboundDate || !body.inboundDate) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: originIata, destinationGroupId, outboundDate, inboundDate' },
        { status: 400 }
      );
    }

    const filters: SearchFilters = {
      originIata: body.originIata,
      destinationGroupId: body.destinationGroupId,
      outboundDate: body.outboundDate,
      inboundDate: body.inboundDate,
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
    return NextResponse.json({ error: 'Error interno buscando itinerarios' }, { status: 500 });
  }
}
