import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const sub = await req.json();
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return NextResponse.json({ error: 'Suscripcion invalida' }, { status: 400 });
    }
    await sql`
      INSERT INTO push_subscriptions (endpoint, p256dh, auth)
      VALUES (${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})
      ON CONFLICT (endpoint) DO NOTHING
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'No se pudo guardar la suscripcion (falta aplicar la migracion en Neon?)' }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = await req.json();
    if (endpoint) await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'Error al desuscribir' }, { status: 503 });
  }
}
