/**
 * tournaments/[id]/page.tsx - Tournament Root Redirect
 *
 * Redirects the bare tournament URL (/tournaments/[id]) to the default
 * game mode tab (/tournaments/[id]/bm).
 *
 * Battle Mode (BM) is chosen as the default because it is the most commonly
 * used mode in JSMKC tournaments. The tab navigation in the layout allows
 * users to switch to other modes from there.
 *
 * Uses Next.js server-side redirect() for an immediate HTTP redirect,
 * avoiding a client-side flash of empty content.
 */
import { redirect } from "next/navigation";

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  /* Redirect to Battle Mode as the default tab view */
  redirect(`/tournaments/${id}/bm`);
}
