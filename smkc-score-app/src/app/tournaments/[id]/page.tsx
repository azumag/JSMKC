/**
 * tournaments/[id]/page.tsx - Tournament Root Redirect
 *
 * Redirects the bare tournament URL (/tournaments/[id]) to the default
 * game mode tab (/tournaments/[id]/ta).
 *
 * Time Attack (TA) is chosen as the default because it is the primary
 * mode users interact with first when opening a tournament.
 * The tab navigation in the layout allows users to switch to other modes.
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
  /* Redirect to Time Attack as the default tab view */
  redirect(`/tournaments/${id}/ta`);
}
