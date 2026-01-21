import winston from 'winston'
import path from 'path'
import * as fs from 'fs'

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
const createTestLogger = (service: string) => {
  return {
    error: (message: string, meta?: Record<string, unknown>) => {
      if (process.env.NODE_ENV === 'test') {
        // Just log to console in tests to avoid setImmediate issues
        console.error(`[ERROR] ${service}: ${message}`, meta);
      }
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      if (process.env.NODE_ENV === 'test') {
        console.warn(`[WARN] ${service}: ${message}`, meta);
      }
    },
    info: (message: string, meta?: Record<string, unknown>) => {
      if (process.env.NODE_ENV === 'test') {
        console.info(`[INFO] ${service}: ${message}`, meta);
      }
    },
    debug: (message: string, meta?: Record<string, unknown>) => {
      if (process.env.NODE_ENV === 'test') {
        console.debug(`[DEBUG] ${service}: ${message}`, meta);
      }
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
const transports: winston.transport[] = [
  // Console transport for development
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
    ),
  }),
];

// Only add file transports in production or when logs directory exists
if (process.env.NODE_ENV === 'production') {
  try {
    // Ensure logs directory exists
    // Use process.cwd() instead of __dirname to handle build environment correctly
    const logsDir = path.join(process.cwd(), 'logs');
    fs.promises.mkdir(logsDir, { recursive: true }).catch(() => {
      // Ignore errors - if directory can't be created, just use console transport
    });

    transports.push(
      // File transport for errors
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        format: winston.format.json(),
      }) as winston.transport,
      // File transport for all logs
      new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        format: winston.format.json(),
      }) as winston.transport,
    );
  } catch (error) {
    // If logs directory can't be created, just use console transport
    console.warn('Could not create logs directory, using console transport only:', error);
  }
}

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