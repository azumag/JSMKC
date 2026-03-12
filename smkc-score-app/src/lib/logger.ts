/**
 * Console-based Structured Logging for the JSMKC Application
 *
 * Provides service-scoped logger creation via createLogger() so that every
 * log line is automatically prefixed with the originating service name,
 * making it easy to filter and trace issues in production.
 *
 * Environment-aware log levels: debug-level output in development,
 * warn-and-above in production. In the test environment a completely
 * silent logger is returned to avoid noisy console output during test runs.
 *
 * Uses console.log/warn/error instead of winston to avoid Node.js-specific
 * dependencies (streams, os, fs) that are unavailable in Cloudflare Workers.
 *
 * Usage:
 *   import { createLogger } from '@/lib/logger';
 *   const log = createLogger('api-players');
 *   log.info('Player registered', { playerId: '123' });
 */

// Log levels with numeric priority (lower = more critical)
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

/**
 * Determine the minimum log level based on environment.
 * Development shows all logs including debug; production only shows warnings and errors.
 */
function getMinLevel(): number {
  const env = process.env.NODE_ENV || 'development';
  return env === 'development' ? LOG_LEVELS.debug : LOG_LEVELS.warn;
}

const minLevel = getMinLevel();

/** Logger interface exposed to consumers — matches the old winston-based API */
export interface Logger {
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Formats a log line with ISO timestamp and service prefix.
 * Example: "2026-03-12T10:30:00.000Z [api-players] Player registered { playerId: '123' }"
 */
function formatMessage(service: string, message: string, meta?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const base = `${timestamp} [${service}] ${message}`;
  // Append metadata as JSON if provided, for structured log parsing
  if (meta && Object.keys(meta).length > 0) {
    return `${base} ${JSON.stringify(meta)}`;
  }
  return base;
}

/**
 * Creates a structured logger instance scoped to a specific service name.
 * In test environment, returns a silent logger to avoid noise.
 * Logger is created at function level inside API route handlers to support jest.mock().
 * @param service - The name of the service/component (e.g., 'api-players', 'auth')
 * @returns Logger instance with error, warn, info, and debug methods
 */
export const createLogger = (service: string): Logger => {
  // Return silent test logger in test environment
  if (process.env.NODE_ENV === 'test') {
    return {
      error: (_message: string, _meta?: Record<string, unknown>) => {},
      warn: (_message: string, _meta?: Record<string, unknown>) => {},
      info: (_message: string, _meta?: Record<string, unknown>) => {},
      debug: (_message: string, _meta?: Record<string, unknown>) => {},
    };
  }

  return {
    error: (message: string, meta?: Record<string, unknown>) => {
      if (minLevel >= LOG_LEVELS.error) {
        console.error(formatMessage(service, message, meta));
      }
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      if (minLevel >= LOG_LEVELS.warn) {
        console.warn(formatMessage(service, message, meta));
      }
    },
    info: (message: string, meta?: Record<string, unknown>) => {
      if (minLevel >= LOG_LEVELS.info) {
        console.log(formatMessage(service, message, meta));
      }
    },
    debug: (message: string, meta?: Record<string, unknown>) => {
      if (minLevel >= LOG_LEVELS.debug) {
        console.debug(formatMessage(service, message, meta));
      }
    },
  };
};

// Default logger for general use
export const log = createLogger('JSMKC');
