import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ error: 'Notificaciones push no configuradas (falta VAPID_PUBLIC_KEY)' }, { status: 503 });
  }
  return NextResponse.json({ publicKey });
}
