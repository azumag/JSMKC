/**
 * TA Entries Forwarding Route
 *
 * This route acts as a proxy/forwarder to the main TA endpoint for consistency.
 * It exists to provide a clean REST URL structure where /ta/entries specifically
 * handles entry-related operations, while the actual logic resides in the main
 * /ta/route.ts handler.
 *
 * This is primarily used by the participant score entry page to fetch entries
 * via polling, keeping the URL semantics clear (GET /ta/entries = fetch entries).
 *
 * The forwarding preserves all search parameters for the main handler.
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/tournaments/[id]/ta/entries
 *
 * Forwards the request to the main TA endpoint (/api/tournaments/[id]/ta).
 * Preserves all query parameters.
 * Returns the response from the main endpoint unchanged.
 */
// Forward to the main ta endpoint for consistency
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Redirect to the main ta endpoint
  const { id: tournamentId } = await params;
  const { searchParams } = new URL(request.url);

  // Preserve search params for the main handler
  const targetUrl = new URL(`/api/tournaments/${tournamentId}/ta`, request.url);
  targetUrl.search = searchParams.toString();

  // Forward the request to the main TA handler
  const response = await fetch(targetUrl.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': request.headers.get('User-Agent') || '',
    },
  });

  const data = await response.json();

  // Return the main endpoint's response with the same status code
  return NextResponse.json(data, { status: response.status });
}
