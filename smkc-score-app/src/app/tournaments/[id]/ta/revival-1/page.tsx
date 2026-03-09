/**
 * Revival Round 1 redirect
 *
 * The revival_1 stage was renamed to phase1 when the shared TAEliminationPhase
 * component was introduced. This redirect exists for backwards compatibility so
 * that any existing links or bookmarks pointing to /ta/revival-1 are silently
 * forwarded to the canonical /ta/phase1 URL.
 */

import { redirect } from "next/navigation";

export default async function RevivalRound1Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/tournaments/${id}/ta/phase1`);
}
