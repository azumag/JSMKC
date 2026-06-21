/**
 * API Route Authentication Helpers
 *
 * Shared session guards for Next.js API routes. Each helper calls auth(),
 * checks the required role/userType, and returns either an error response
 * or the narrowed session — letting callers early-return on `{ error }` or
 * destructure `{ session }` for downstream use.
 *
 * Extracted from ta/route.ts and ta/phases/route.ts where the same logic
 * was duplicated verbatim (#2503).
 */

import { NextResponse } from 'next/server';
import type { User } from 'next-auth';
import { auth } from '@/lib/auth';
// handleAuthzError() === createErrorResponse('Forbidden', 403, 'FORBIDDEN') — same body/headers (#2510)
import { handleAuthzError } from '@/lib/error-handling';

// session is never null on success: helpers return { error } on failure, { session } on success (#2511)
export type AuthSessionResult = { error?: NextResponse; session?: { user: User } };

/**
 * Requires an authenticated admin session.
 * Returns { error: 403 } if the caller is unauthenticated or not an admin.
 * Returns { session } on success; session.user is guaranteed non-null.
 *
 * Note: TS cannot narrow `user?` through optional-chaining guards, so we
 * cast to `{ user: User }` after the explicit null check above.
 */
export async function requireAdminSession(): Promise<AuthSessionResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return { error: handleAuthzError() };
  }
  return { session: session as { user: User } };
}

/**
 * Requires an admin or player session.
 * Admins have full access; players must additionally verify resource ownership
 * in the caller (this helper only checks authentication, not authorization).
 * Returns { error: 403 } if unauthenticated or neither admin nor player.
 */
export async function requireAdminOrPlayerSession(): Promise<AuthSessionResult> {
  const session = await auth();
  if (session?.user?.role === 'admin') return { session: session as { user: User } };
  if (session?.user?.userType === 'player') return { session: session as { user: User } };
  return { error: handleAuthzError() };
}
