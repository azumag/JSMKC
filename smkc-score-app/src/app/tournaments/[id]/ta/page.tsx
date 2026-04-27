/**
 * Time Attack Qualification Page — Server Component shell
 *
 * Fetches initial qualification data from D1 at request time and passes it
 * to the client component as `initialData`. This eliminates the loading
 * skeleton flash on first paint: usePolling seeds its state from the
 * server-rendered payload instead of starting with null and waiting for
 * the first poll to complete.
 *
 * Subsequent polling is unchanged — the client component continues to
 * refresh data at the standard interval via usePolling.
 *
 * `force-dynamic` ensures the page is never statically cached by Next.js;
 * tournament data changes in real time and must be fresh on every request.
 */

export const dynamic = 'force-dynamic';

import TimeAttackPageClient from './page-client';
import { fetchTaInitialData } from '@/lib/ta/initial-data';

export default async function TimeAttackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const initialData = await fetchTaInitialData(id);

  return <TimeAttackPageClient tournamentId={id} initialData={initialData} />;
}
