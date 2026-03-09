/**
 * Revival Round 2 redirect
 *
 * The revival_2 stage was renamed to phase2 when the shared TAEliminationPhase
 * component was introduced. This redirect exists for backwards compatibility so
 * that any existing links or bookmarks pointing to /ta/revival-2 are silently
 * forwarded to the canonical /ta/phase2 URL.
 */

import { redirect } from "next/navigation";

export default async function RevivalRound2Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/tournaments/${id}/ta/phase2`);
}
