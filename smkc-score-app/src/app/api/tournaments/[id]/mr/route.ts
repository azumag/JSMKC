/**
 * Match Race (MR) Qualification API Route
 *
 * Thin wrapper that delegates to the shared qualification-route factory
 * with MR-specific configuration. See mr-config.ts for scoring rules.
 *
 * Security fix: POST now requires authentication (previously had no auth check).
 *
 * - GET:  Fetch qualification standings and matches
 * - POST: Setup groups and generate round-robin matches (admin only)
 * - PUT:  Update a match score and recalculate standings
 */

import { createQualificationHandlers } from '@/lib/api-factories/qualification-route';
import { mrConfig } from '@/lib/event-types';

const { GET, POST, PUT } = createQualificationHandlers(mrConfig);
export { GET, POST, PUT };
