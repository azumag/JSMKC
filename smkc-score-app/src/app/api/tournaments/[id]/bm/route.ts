/**
 * Battle Mode (BM) Qualification API Route
 *
 * Thin wrapper that delegates to the shared qualification-route factory
 * with BM-specific configuration. See bm-config.ts for scoring rules.
 *
 * - GET:  Fetch qualification standings and matches
 * - POST: Setup groups and generate round-robin matches (admin only, audit-logged)
 * - PUT:  Update a match score and recalculate standings
 */

import { createQualificationHandlers } from '@/lib/api-factories/qualification-route';
import { bmConfig } from '@/lib/event-types';

const { GET, POST, PUT } = createQualificationHandlers(bmConfig);
export { GET, POST, PUT };
