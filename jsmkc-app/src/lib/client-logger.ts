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
  service: string;
}

/**
 * Creates a test logger that suppresses all output to avoid noise in tests
 * This mirrors the server-side test logger behavior
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const createTestLogger = (_serviceName: string) => {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    error: (_message: string, _meta?: LogMetadata) => {
      // Silent mode for tests - don't log to console to avoid noise
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    warn: (_message: string, _meta?: LogMetadata) => {
      // Silent mode for tests
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    info: (_message: string, _meta?: LogMetadata) => {
      // Silent mode for tests
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    debug: (_message: string, _meta?: LogMetadata) => {
      // Silent mode for tests
    },
  };
};

/**
 * Creates a logger instance for a specific service/component
 * @param options - Logger configuration options
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

  /**
   * Format log message with service context
   * @param level - Log level
   * @param message - Log message
   * @param meta - Optional metadata
   */
  const formatMessage = (level: string, message: string, meta?: LogMetadata): string => {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${serviceName}] [${level}] ${message}${metaStr}`;
  };

  /**
   * Send log to server for aggregation (optional)
   * @param level - Log level
   * @param message - Log message
   * @param meta - Optional metadata
   */
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
        // Don't let error aggregation errors cause infinite loops
        console.warn('[client-logger] Failed to send error to server:', err);
      });
    } catch (err) {
      // Silently fail to avoid breaking the application
      console.warn('[client-logger] Error in sendToServer:', err);
    }
  };

  return {
    /**
     * Log an error message
     * @param message - The error message
     * @param meta - Optional additional metadata
     */
    error: (message: string, meta?: LogMetadata) => {
      const formattedMessage = formatMessage('ERROR', message, meta);
      console.error(formattedMessage);
      sendToServer('error', message, meta);
    },

    /**
     * Log a warning message
     * @param message - The warning message
     * @param meta - Optional additional metadata
     */
    warn: (message: string, meta?: LogMetadata) => {
      const formattedMessage = formatMessage('WARN', message, meta);
      console.warn(formattedMessage);
      sendToServer('warn', message, meta);
    },

    /**
     * Log an info message
     * @param message - The info message
     * @param meta - Optional additional metadata
     */
    info: (message: string, meta?: LogMetadata) => {
      const formattedMessage = formatMessage('INFO', message, meta);
      console.info(formattedMessage);
      sendToServer('info', message, meta);
    },

    /**
     * Log a debug message
     * @param message - The debug message
     * @param meta - Optional additional metadata
     */
    debug: (message: string, meta?: LogMetadata) => {
      const formattedMessage = formatMessage('DEBUG', message, meta);
      console.debug(formattedMessage);
      sendToServer('debug', message, meta);
    },
  };
};

/**
 * Default export for backward compatibility
 * Creates a basic logger instance without service aggregation
 */
export default createLogger;
