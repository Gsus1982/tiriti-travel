import { NextRequest, NextResponse } from 'next/server';
import { searchCircuit, MAX_CIRCUIT_LEGS } from '@/lib/circuit-search';
import { getIgnavUsageSummary } from '@/lib/ignav-usage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { legs, adults, children } = body;
    if (!Array.isArray(legs) || legs.length === 0) {
      return NextResponse.json({ error: 'Faltan los tramos del circuito' }, { status: 400 });
    }
    if (legs.length > MAX_CIRCUIT_LEGS) {
      return NextResponse.json(
        { error: `Un circuito admite como maximo ${MAX_CIRCUIT_LEGS} tramos ahora mismo, para proteger tu cuota de Ignav.` },
        { status: 400 }
      );
    }

    // Aviso previo (no bloqueante salvo cuota agotada del todo): cada tramo gasta 1
    // peticion real, sin el ajuste dinamico que ya protege la busqueda principal.
    try {
      const usage = await getIgnavUsageSummary();
      if (usage.remaining < legs.length) {
        return NextResponse.json(
          {
            error: `Te quedan ${usage.remaining} peticiones de Ignav y este circuito necesita ${legs.length} -- reduce el numero de tramos.`
          },
          { status: 400 }
        );
      }
    } catch {
      // Contador no disponible todavia -- no bloquea, se deja pasar.
    }

    const result = await searchCircuit(legs, { adults: adults ?? 1, children: children ?? 0 });
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status: 502 });
  }
}
