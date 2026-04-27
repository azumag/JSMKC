/**
 * Battle Mode (BM) Qualification API Route
 *
 * Thin wrapper that delegates to the shared qualification-route factory
 * with BM-specific configuration. See bm-config.ts for scoring rules.
 *
 * - GET:   Fetch qualification standings and matches
 * - POST:  Setup groups and generate round-robin matches (admin only, audit-logged)
 * - PUT:   Update a match score and recalculate standings
 * - PATCH: Assign TV number to a match (admin only)
 */

import { withApiTiming } from '@/lib/perf/api-timing';
import { createQualificationHandlers } from '@/lib/api-factories/qualification-route';
import { bmConfig } from '@/lib/event-types';

const { GET: _GET, POST, PUT, PATCH } = createQualificationHandlers(bmConfig);
export { POST, PUT, PATCH };
export const GET = (...args: Parameters<typeof _GET>): ReturnType<typeof _GET> =>
  withApiTiming('bm.qual.GET', () => _GET(...args));
