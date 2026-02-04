/**
 * Central Configuration Constants for the JSMKC Application
 *
 * Collects magic numbers and fixed values into one module so they
 * can be referenced by name rather than duplicated as raw literals.
 *
 * Grouped by concern:
 * - Game data: course list, course metadata, character roster
 * - Authentication: access/refresh token expiry durations
 * - Rate limiting: per-endpoint request caps and time windows
 * - Score validation: min/max battle scores
 * - Optimistic locking: retry attempts and exponential back-off base
 * - Polling: client-side refresh intervals
 * - Audit: log retention period
 *
 * All values are exported as named constants with descriptive identifiers.
 *
 * Usage:
 *   import { COURSES, POLLING_INTERVAL, MAX_BATTLE_SCORE } from '@/lib/constants';
 */

/**
 * Course abbreviations in order for SMK (20 courses total).
 * Grouped by cup (5 courses per cup) in round order:
 *
 * Mushroom Cup: MC1, DP1, GV1, BC1, MC2
 * Flower Cup:   CI1, GV2, DP2, BC2, MC3
 * Star Cup:     KB1, CI2, VL1, BC3, MC4
 * Special Cup:  DP3, KB2, GV3, VL2, RR
 *
 * NOTE: "KB2" was previously "KD". If existing DB records have "KD" as a
 * times JSON key, a migration (renaming "KD" → "KB2" in TTEntry.times) is needed.
 */
export const COURSES = [
  "MC1", "DP1", "GV1", "BC1", "MC2",
  "CI1", "GV2", "DP2", "BC2", "MC3",
  "KB1", "CI2", "VL1", "BC3", "MC4",
  "DP3", "KB2", "GV3", "VL2", "RR"
] as const;

export type CourseAbbr = typeof COURSES[number];

/**
 * Course metadata with full English names and cup assignment.
 * Ordered by cup round (matches COURSES array order).
 *
 * Cup-course mapping (official SMK / SFC course order):
 * ┌─────────────┬─────────────────┬─────────────────┬─────────────────┬─────────────────┬─────────────────┐
 * │ Cup         │ Round 1         │ Round 2         │ Round 3         │ Round 4         │ Round 5         │
 * ├─────────────┼─────────────────┼─────────────────┼─────────────────┼─────────────────┼─────────────────┤
 * │ Mushroom    │ Mario Circuit 1 │ Donut Plains 1  │ Ghost Valley 1  │ Bowser Castle 1 │ Mario Circuit 2 │
 * │ Flower      │ Choco Island 1  │ Ghost Valley 2  │ Donut Plains 2  │ Bowser Castle 2 │ Mario Circuit 3 │
 * │ Star        │ Koopa Beach 1   │ Choco Island 2  │ Vanilla Lake 1  │ Bowser Castle 3 │ Mario Circuit 4 │
 * │ Special     │ Donut Plains 3  │ Koopa Beach 2   │ Ghost Valley 3  │ Vanilla Lake 2  │ Rainbow Road    │
 * └─────────────┴─────────────────┴─────────────────┴─────────────────┴─────────────────┴─────────────────┘
 */
export const COURSE_INFO: { abbr: CourseAbbr; name: string; cup: string }[] = [
  // Mushroom Cup
  { abbr: "MC1", name: "Mario Circuit 1", cup: "Mushroom" },
  { abbr: "DP1", name: "Donut Plains 1", cup: "Mushroom" },
  { abbr: "GV1", name: "Ghost Valley 1", cup: "Mushroom" },
  { abbr: "BC1", name: "Bowser Castle 1", cup: "Mushroom" },
  { abbr: "MC2", name: "Mario Circuit 2", cup: "Mushroom" },
  // Flower Cup
  { abbr: "CI1", name: "Choco Island 1", cup: "Flower" },
  { abbr: "GV2", name: "Ghost Valley 2", cup: "Flower" },
  { abbr: "DP2", name: "Donut Plains 2", cup: "Flower" },
  { abbr: "BC2", name: "Bowser Castle 2", cup: "Flower" },
  { abbr: "MC3", name: "Mario Circuit 3", cup: "Flower" },
  // Star Cup
  { abbr: "KB1", name: "Koopa Beach 1", cup: "Star" },
  { abbr: "CI2", name: "Choco Island 2", cup: "Star" },
  { abbr: "VL1", name: "Vanilla Lake 1", cup: "Star" },
  { abbr: "BC3", name: "Bowser Castle 3", cup: "Star" },
  { abbr: "MC4", name: "Mario Circuit 4", cup: "Star" },
  // Special Cup
  { abbr: "DP3", name: "Donut Plains 3", cup: "Special" },
  { abbr: "KB2", name: "Koopa Beach 2", cup: "Special" },
  { abbr: "GV3", name: "Ghost Valley 3", cup: "Special" },
  { abbr: "VL2", name: "Vanilla Lake 2", cup: "Special" },
  { abbr: "RR", name: "Rainbow Road", cup: "Special" },
];

// Total number of courses in time attack
export const TOTAL_COURSES = COURSES.length;

// SMK playable characters (8 total)
export const SMK_CHARACTERS = [
  'Mario',
  'Luigi',
  'Peach',
  'Toad',
  'Yoshi',
  'DK Jr.',
  'Bowser',
  'Koopa',
] as const;

export type SMKCharacter = typeof SMK_CHARACTERS[number];

// Token and authentication constants
export const ACCESS_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
export const REFRESH_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Rate limiting constants - loose limits to prevent only obvious abuse.
// This is an internal tournament management tool with a small number of admin users.
export const RATE_LIMIT_SCORE_INPUT = 120; // requests per minute for score submission
export const RATE_LIMIT_SCORE_INPUT_DURATION = 60 * 1000; // 1 minute window
export const RATE_LIMIT_POLLING = 120; // requests per minute for polling
export const RATE_LIMIT_POLLING_DURATION = 60 * 1000; // 1 minute window
export const RATE_LIMIT_SESSION_STATUS = 60; // requests per minute for session status checks

// Score validation constants - BM rounds are best of 5 (first to 3)
export const MIN_BATTLE_SCORE = 0;
export const MAX_BATTLE_SCORE = 5;

// Optimistic locking constants - retry parameters for concurrent update conflicts
export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_BASE_DELAY = 100; // milliseconds, exponentially increases

// Polling constants - client-side data refresh intervals
export const POLLING_INTERVAL = 5000; // 5 seconds between polls
export const POLLING_MIN_REQUEST_INTERVAL = 500; // minimum 500ms between requests

// Audit log retention period
export const AUDIT_LOG_RETENTION_DAYS = 90;

// Retry penalty: When a player retries during a finals course,
// their time is set to 9:59.990 (the maximum representable time).
// This ensures the retrying player receives the worst possible time for that round.
export const RETRY_PENALTY_MS = 599990; // 9 min 59 sec 990 ms
export const RETRY_PENALTY_DISPLAY = "9:59.990";

// HTTP status codes for special responses
export const RATE_LIMIT_STATUS_CODE = 429;
export const OPTIMISTIC_LOCK_STATUS_CODE = 409;
