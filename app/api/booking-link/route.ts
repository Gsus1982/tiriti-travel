import { NextRequest, NextResponse } from 'next/server';
import { getBookingLinksByIgnavId } from '@/lib/ignav';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { ignavId } = (await req.json()) as { ignavId?: string };
    if (!ignavId) return NextResponse.json({ error: 'Falta ignavId' }, { status: 400 });
    const data = await getBookingLinksByIgnavId(ignavId);
    return NextResponse.json(data);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Error obteniendo enlaces de reserva';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
