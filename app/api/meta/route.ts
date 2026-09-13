import { NextResponse } from 'next/server';
import { listDestinationGroups, listOriginAirports } from '@/lib/search-engine';

export async function GET() {
  const [groups, origins] = await Promise.all([listDestinationGroups(), listOriginAirports()]);
  return NextResponse.json({ groups, origins });
}
