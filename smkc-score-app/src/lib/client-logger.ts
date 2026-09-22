/**
 * Client-side logger utility
 * Provides structured logging for React components to match server-side logging patterns
 */

export interface LogLevel {
  ERROR: 'error';
  WARN: 'warn';
  INFO: 'info';
  DEBUG: 'debug';
}

export interface LoggerOptions {
  serviceName: string;
  enableServerAggregation?: boolean;
  serverEndpoint?: string;
}

interface LogMetadata extends Record<string, unknown> {
  timestamp?: string;
  service?: string;
}

/**
 * Serialize meta for log output. Error instances need a JSON.stringify replacer
 * because `name`/`message`/`stack` are non-enumerable and would otherwise
 * disappear, leaving operators with `{"error":{}}` in production logs (mirrors
 * the same handling in src/lib/logger.ts).
 *
 * Logging must also stay fail-safe when callers attach cyclic objects. Track the
 * current ancestor chain (rather than every object ever seen) so true cycles are
 * replaced while the same non-cyclic object can still be serialized in two
 * different branches.
 */
export function serializeMeta(meta: LogMetadata): string {
  const ancestors: object[] = [];

  return JSON.stringify(meta, function (_key, value) {
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    if (typeof value !== 'object' || value === null) {
      return value;
    }

    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
      ancestors.pop();
    }
    if (ancestors.includes(value)) {
      return '[Circular]';
    }
    ancestors.push(value);
    return value;
  });
}

// Silent test logger to avoid noise in test output
const createTestLogger = (_serviceName: string) => {
  return {
    error: (_message: string, _meta?: LogMetadata) => {},
    warn: (_message: string, _meta?: LogMetadata) => {},
    info: (_message: string, _meta?: LogMetadata) => {},
    debug: (_message: string, _meta?: LogMetadata) => {},
  };
};

/**
 * Creates a client-side logger instance for a specific service/component.
 * Optionally aggregates logs to a server endpoint for centralized monitoring.
 * @param options - Logger configuration including service name and server aggregation settings
 * @returns Logger object with error, warn, info, and debug methods
 */
export const createLogger = (options: LoggerOptions) => {
  const { serviceName, enableServerAggregation = false, serverEndpoint = '/api/client-errors' } = options;

  // Return silent test logger in test environment to avoid noise
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    return createTestLogger(serviceName);
  }

  // Format log message with timestamp, service name, and level
  const formatMessage = (level: string, message: string, meta?: LogMetadata): string => {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${serializeMeta(meta)}` : '';
    return `[${timestamp}] [${serviceName}] [${level}] ${message}${metaStr}`;
  };

  // Asynchronously send log to server for aggregation (optional)
  // Uses keepalive to ensure logs are sent even during page unload
  const sendToServer = async (level: string, message: string, meta?: LogMetadata) => {
    if (!enableServerAggregation) {
      return;
    }

    try {
      await fetch(serverEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serializeMeta({
          level,
          serviceName,
          message,
          meta: {
            ...meta,
            timestamp: new Date().toISOString(),
            userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'server',
            url: typeof window !== 'undefined' ? window.location.href : 'server',
          },
        }),
        keepalive: true,
      }).catch((err) => {
        // Prevent error aggregation errors from causing infinite loops
        console.warn('[client-logger] Failed to send error to server:', err);
      });
    } catch (err) {
      // Silently fail to avoid breaking the application
      console.warn('[client-logger] Error in sendToServer:', err);
    }
  };

  return {
    error: (message: string, meta?: LogMetadata) => {
      const formattedMessage = formatMessage('ERROR', message, meta);
      console.error(formattedMessage);
      sendToServer('error', message, meta);
    },
    warn: (message: string, meta?: LogMetadata) => {
      const formattedMessage = formatMessage('WARN', message, meta);
      console.warn(formattedMessage);
      sendToServer('warn', message, meta);
    },
    info: (message: string, meta?: LogMetadata) => {
      const formattedMessage = formatMessage('INFO', message, meta);
      console.info(formattedMessage);
      sendToServer('info', message, meta);
    },
    debug: (message: string, meta?: LogMetadata) => {
      const formattedMessage = formatMessage('DEBUG', message, meta);
      console.debug(formattedMessage);
      sendToServer('debug', message, meta);
    },
  };
};

export default createLogger;
