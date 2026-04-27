/**
 * Match Race Qualification Page — Server Component shell
 *
 * Pre-fetches initial qualification data at request time and passes it to the
 * client component as `initialData`, eliminating the loading skeleton flash on
 * first paint.  Subsequent polling is unchanged.
 *
 * `force-dynamic` prevents static caching since tournament data changes in real time.
 */

export const dynamic = 'force-dynamic';

import MatchRacePageClient from './page-client';
import { fetchQualInitialData } from '@/lib/api-factories/qual-initial-data';
import { mrConfig } from '@/lib/event-types';

export default async function MatchRacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initialData = await fetchQualInitialData(mrConfig, id);

  return <MatchRacePageClient tournamentId={id} initialData={initialData} />;
}
