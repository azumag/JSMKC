/**
 * MR debug-fill route. Admin-only; requires Tournament.debugMode === true.
 * Fills empty MR qualification matches with random valid scores + rounds.
 * See src/lib/debug/debug-fill.ts for shared logic.
 */
import type { NextRequest } from 'next/server';
import { handleDebugFillRequest } from '@/lib/debug/debug-fill';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleDebugFillRequest(id, 'mr', request);
}
