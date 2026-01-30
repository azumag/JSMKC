import winston from 'winston'

// Define log levels with numeric priority (lower = more critical)
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

// Define colors for each log level for console output
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
}

// Register color scheme with Winston
winston.addColors(colors)

// Determine log level based on environment
// Development shows all logs including debug; production only shows warnings and errors
const level = () => {
  const env = process.env.NODE_ENV || 'development'
  const isDevelopment = env === 'development'
  return isDevelopment ? 'debug' : 'warn'
}

// Test logger that suppresses all output to avoid console noise in test runs
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const createTestLogger = (_service: string) => {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    error: (_message: string, _meta?: Record<string, unknown>) => {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    warn: (_message: string, _meta?: Record<string, unknown>) => {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    info: (_message: string, _meta?: Record<string, unknown>) => {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    debug: (_message: string, _meta?: Record<string, unknown>) => {},
  }
}

// Log format: timestamp + colorized level + message
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`,
  ),
)

// Console-only transport to avoid fs bundling issues in Next.js edge runtime
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
    ),
  }),
];

// Create the singleton Winston logger instance
const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
})

/**
 * Creates a structured logger instance scoped to a specific service name.
 * In test environment, returns a silent logger to avoid noise.
 * Logger is created at function level inside API route handlers to support jest.mock().
 * @param service - The name of the service/component (e.g., 'api-players', 'auth')
 * @returns Logger instance with error, warn, info, and debug methods
 */
export const createLogger = (service: string) => {
  // Return silent test logger in test environment
  if (process.env.NODE_ENV === 'test') {
    return createTestLogger(service);
  }

  return {
    error: (message: string, meta?: Record<string, unknown>) => {
      logger.error(`${service}: ${message}`, meta)
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      logger.warn(`${service}: ${message}`, meta)
    },
    info: (message: string, meta?: Record<string, unknown>) => {
      logger.info(`${service}: ${message}`, meta)
    },
    debug: (message: string, meta?: Record<string, unknown>) => {
      logger.debug(`${service}: ${message}`, meta)
    },
  }
}

// Default logger for general use
export const log = createLogger('JSMKC')

// Export winston logger for advanced use cases
export default logger
