/**
 * Grand Prix (GP) Qualification API Route
 *
 * Thin wrapper that delegates to the shared qualification-route factory
 * with GP-specific configuration. See gp-config.ts for scoring rules.
 *
 * GP uses driver points (1st=9, 2nd=6) instead of round win/loss scores.
 *
 * - GET:  Fetch qualification standings and matches
 * - POST: Setup groups and generate round-robin matches (admin only)
 * - PUT:  Update a match with cup and race positions, recalculate standings
 */

import { createQualificationHandlers } from '@/lib/api-factories/qualification-route';
import { gpConfig } from '@/lib/event-types';

const { GET, POST, PUT } = createQualificationHandlers(gpConfig);
export { GET, POST, PUT };
