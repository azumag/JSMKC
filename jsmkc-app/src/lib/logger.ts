import winston from 'winston'

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

// Define colors for each log level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
}

// Tell Winston to use these colors
winston.addColors(colors)

// Define which log level to use based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development'
  const isDevelopment = env === 'development'
  return isDevelopment ? 'debug' : 'warn'
}

// Simple mock logger for tests
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const createTestLogger = (_service: string) => {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    error: (_message: string, _meta?: Record<string, unknown>) => {
      // Silent mode for tests - don't log to console to avoid noise
      // This prevents console.error messages during test execution
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    warn: (_message: string, _meta?: Record<string, unknown>) => {
      // Silent mode for tests
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    info: (_message: string, _meta?: Record<string, unknown>) => {
      // Silent mode for tests
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    debug: (_message: string, _meta?: Record<string, unknown>) => {
      // Silent mode for tests
    },
  }
}

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`,
  ),
)

// Define transports (where logs go)
// For now, only use console transport to avoid fs bundling issues
// File transports will be added in a future update with proper server-side configuration
const transports: winston.transport[] = [
  // Console transport for development and production
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
    ),
  }),
];

// Create logger instance
const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
})

/**
 * Creates a structured logger instance for a specific service
 * @param service - The name of the service/component using the logger
 * @returns Logger instance with error, warn, info, and debug methods
 */
export const createLogger = (service: string) => {
  if (process.env.NODE_ENV === 'test') {
    return createTestLogger(service);
  }

  return {
    /**
     * Log an error message
     * @param message - The error message
     * @param meta - Optional additional metadata
     */
    error: (message: string, meta?: Record<string, unknown>) => {
      logger.error(`${service}: ${message}`, meta)
    },
    /**
     * Log a warning message
     * @param message - The warning message
     * @param meta - Optional additional metadata
     */
    warn: (message: string, meta?: Record<string, unknown>) => {
      logger.warn(`${service}: ${message}`, meta)
    },
    /**
     * Log an info message
     * @param message - The info message
     * @param meta - Optional additional metadata
     */
    info: (message: string, meta?: Record<string, unknown>) => {
      logger.info(`${service}: ${message}`, meta)
    },
    /**
     * Log a debug message
     * @param message - The debug message
     * @param meta - Optional additional metadata
     */
    debug: (message: string, meta?: Record<string, unknown>) => {
      logger.debug(`${service}: ${message}`, meta)
    },
  }
}

// Default logger for general use
export const log = createLogger('JSMKC')

// Export winston logger for advanced use cases
export default logger