// Course abbreviations in order for Super Mario Kart
export const COURSES = [
  "MC1", "DP1", "GV1", "BC1",
  "MC2", "DP2", "GV2", "BC2",
  "MC3", "DP3", "GV3", "BC3",
  "CI1", "CI2", "RR", "VL1",
  "VL2", "KD", "MC4", "KB1"
] as const;

export type CourseAbbr = typeof COURSES[number];

// Course info with full names
export const COURSE_INFO: { abbr: CourseAbbr; name: string; cup: string }[] = [
  { abbr: "MC1", name: "Mario Circuit 1", cup: "Mushroom" },
  { abbr: "DP1", name: "Donut Plains 1", cup: "Mushroom" },
  { abbr: "GV1", name: "Ghost Valley 1", cup: "Mushroom" },
  { abbr: "BC1", name: "Bowser Castle 1", cup: "Mushroom" },
  { abbr: "MC2", name: "Mario Circuit 2", cup: "Flower" },
  { abbr: "DP2", name: "Donut Plains 2", cup: "Flower" },
  { abbr: "GV2", name: "Ghost Valley 2", cup: "Flower" },
  { abbr: "BC2", name: "Bowser Castle 2", cup: "Flower" },
  { abbr: "MC3", name: "Mario Circuit 3", cup: "Star" },
  { abbr: "DP3", name: "Donut Plains 3", cup: "Star" },
  { abbr: "GV3", name: "Ghost Valley 3", cup: "Star" },
  { abbr: "BC3", name: "Bowser Castle 3", cup: "Star" },
  { abbr: "CI1", name: "Choco Island 1", cup: "Special" },
  { abbr: "CI2", name: "Choco Island 2", cup: "Special" },
  { abbr: "RR", name: "Rainbow Road", cup: "Special" },
  { abbr: "VL1", name: "Vanilla Lake 1", cup: "Special" },
  { abbr: "VL2", name: "Vanilla Lake 2", cup: "Special" },
  { abbr: "KD", name: "Koopa Beach 1", cup: "Special" },
  { abbr: "MC4", name: "Mario Circuit 4", cup: "Special" },
  { abbr: "KB1", name: "Koopa Beach 2", cup: "Special" },
]; 

// Total number of courses in time attack
export const TOTAL_COURSES = COURSES.length;

// Super Mario Kart characters
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

/**
 * Application constants and configuration values
 */

// Token and authentication constants
export const ACCESS_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
export const REFRESH_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Rate limiting constants
export const RATE_LIMIT_SCORE_INPUT = 20; // requests per minute
export const RATE_LIMIT_SCORE_INPUT_DURATION = 60 * 1000; // 1 minute in milliseconds
export const RATE_LIMIT_POLLING = 12; // requests per minute (5 second intervals)
export const RATE_LIMIT_POLLING_DURATION = 60 * 1000; // 1 minute in milliseconds
export const RATE_LIMIT_TOKEN_VALIDATION = 10; // requests per minute

// Score validation constants
export const MIN_BATTLE_SCORE = 0;
export const MAX_BATTLE_SCORE = 5;

// Optimistic locking constants
export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_BASE_DELAY = 100; // milliseconds

// Polling constants
export const POLLING_INTERVAL = 5000; // 5 seconds
export const POLLING_MIN_REQUEST_INTERVAL = 500; // 500ms minimum between requests

// Audit log retention
export const AUDIT_LOG_RETENTION_DAYS = 90;

// Token generation
export const TOKEN_LENGTH = 32; // characters

// Rate limiting response codes
export const RATE_LIMIT_STATUS_CODE = 429;
export const OPTIMISTIC_LOCK_STATUS_CODE = 409;
