import { NextRequest, NextResponse } from 'next/server';
import { getWikipediaSummary } from '@/lib/wikipedia';
import { getCountryInfo, getPlugNote } from '@/lib/country-info';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { destinationName, countryIso2 } = await req.json();
    if (!destinationName) {
      return NextResponse.json({ error: 'Falta destinationName' }, { status: 400 });
    }

    const [wiki, country] = await Promise.all([
      getWikipediaSummary(destinationName).catch(() => null),
      countryIso2 ? getCountryInfo(countryIso2).catch(() => null) : Promise.resolve(null)
    ]);

    return NextResponse.json({
      wiki,
      country,
      plugNote: countryIso2 ? getPlugNote(countryIso2) : null
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error interno' }, { status: 502 });
  }
}
