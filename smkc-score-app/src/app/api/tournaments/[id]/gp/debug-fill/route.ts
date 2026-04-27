/**
 * GP debug-fill route. Admin-only; requires Tournament.debugMode === true.
 * Fills empty GP qualification matches with 5 random race results per cup.
 * See src/lib/debug/debug-fill.ts for shared logic.
 */
import type { NextRequest } from 'next/server';
import { handleDebugFillRequest } from '@/lib/debug/debug-fill';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleDebugFillRequest(id, 'gp', request);
}
