import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const airports = (await sql`
    SELECT iata, city, country, group_id, lat, lon, is_origin_candidate
    FROM airports
    WHERE lat IS NOT NULL AND lon IS NOT NULL
  `) as {
    iata: string;
    city: string;
    country: string;
    group_id: string | null;
    lat: number;
    lon: number;
    is_origin_candidate: boolean;
  }[];

  const origins = airports.filter((a) => a.is_origin_candidate);
  const destinations = airports.filter((a) => !a.is_origin_candidate);

  return NextResponse.json({ origins, destinations });
}
