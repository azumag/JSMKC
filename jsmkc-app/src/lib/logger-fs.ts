// Server-only file system operations for logger
// This file is only imported in Node.js environments (production builds)
// Client components will never import this, avoiding fs module bundling issues
// The 'use server' directive marks this as server-only code
'use server';

import winston from 'winston';
import path from 'path';
import * as fs from 'fs';

// Define winston transport type for proper type checking
type WinstonTransport = winston.transport;

/**
 * Setup file transports for production logging.
 * Creates logs directory and configures error/combined log files.
 * Falls back gracefully to console-only if filesystem access fails.
 * @param transports - Existing transports array to extend
 * @returns Extended transports array with file transports added
 */
export function setupFileTransports(transports: WinstonTransport[]): WinstonTransport[] {
  const newTransports = [...transports];

  try {
    // Ensure logs directory exists using process.cwd() for build environment compatibility
    const logsDir = path.join(process.cwd(), 'logs');
    fs.promises.mkdir(logsDir, { recursive: true }).catch(() => {
      // Ignore errors - if directory can't be created, just use console transport
    });

    newTransports.push(
      // File transport for errors only
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        format: winston.format.json(),
      }) as WinstonTransport,
      // File transport for all log levels
      new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        format: winston.format.json(),
      }) as WinstonTransport,
    );
  } catch (error) {
    // If logs directory can't be created, just use console transport
    console.warn('Could not create logs directory, using console transport only:', error);
  }

  return newTransports;
}
