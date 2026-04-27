/**
 * TA debug-fill route. Admin-only; requires Tournament.debugMode === true.
 * Fills entries missing course times with 20 random "M:SS.mm" times each.
 * Existing per-course times on an entry are preserved (merged-in).
 * See src/lib/debug/debug-fill.ts for shared logic.
 */
import type { NextRequest } from 'next/server';
import { handleDebugFillRequest } from '@/lib/debug/debug-fill';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleDebugFillRequest(id, 'ta', request);
}
