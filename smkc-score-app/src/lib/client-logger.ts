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

// Silent test logger to avoid noise in test output
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const createTestLogger = (_serviceName: string) => {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    error: (_message: string, _meta?: LogMetadata) => {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    warn: (_message: string, _meta?: LogMetadata) => {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    info: (_message: string, _meta?: LogMetadata) => {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const {
    serviceName,
    enableServerAggregation = false,
    serverEndpoint = '/api/client-errors'
  } = options;

  // Return silent test logger in test environment to avoid noise
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    return createTestLogger(serviceName);
  }

  // Format log message with timestamp, service name, and level
  const formatMessage = (level: string, message: string, meta?: LogMetadata): string => {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
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
        body: JSON.stringify({
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
      }).catch(err => {
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
