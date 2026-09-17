import { NextRequest, NextResponse } from 'next/server';
import { getCheapDestinationsFromOrigin } from '@/lib/travelpayouts';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { origin } = await req.json();
    if (!origin || typeof origin !== 'string') {
      return NextResponse.json({ error: 'Falta origin' }, { status: 400 });
    }
    if (!process.env.TRAVELPAYOUTS_TOKEN) {
      return NextResponse.json(
        { error: 'Explorar destinos no esta configurado (falta TRAVELPAYOUTS_TOKEN)' },
        { status: 503 }
      );
    }

    const destinations = await getCheapDestinationsFromOrigin(origin.toUpperCase());
    destinations.sort((a, b) => a.price - b.price);
    const top = destinations.slice(0, 24);

    // Cruce contra los destinos reales verificados (misma tabla que usa el selector
    // "Destinos"): permite marcar cuales de estos ya sabemos con seguridad que tienen
    // vuelo directo confirmado desde este origen, para que "Buscar este" solo se ofrezca
    // en esos -- los demas se muestran igual, como pura inspiracion, pero sin ese boton.
    const iatas = top.map((d) => d.destinationIata);
    const verifiedRows =
      iatas.length > 0
        ? ((await sql`SELECT dest_iata, dest_name FROM aena_destinations WHERE dest_iata = ANY(${iatas}::text[])`) as {
            dest_iata: string;
            dest_name: string;
          }[])
        : [];
    const verifiedMap = new Map(verifiedRows.map((r) => [r.dest_iata, r.dest_name]));

    const result = top.map((d) => ({
      ...d,
      verifiedName: verifiedMap.get(d.destinationIata) ?? null
    }));

    return NextResponse.json({ destinations: result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status: 502 });
  }
}
