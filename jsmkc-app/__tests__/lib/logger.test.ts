// @ts-nocheck - This test file uses complex mock types that are difficult to type correctly
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createLogger } from '@/lib/logger';

// Mock winston
jest.mock('winston', () => {
  const mockLogger = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };

  return {
    createLogger: jest.fn().mockReturnValue(mockLogger),
    addColors: jest.fn(),
    format: {
      combine: jest.fn(),
      timestamp: jest.fn(),
      colorize: jest.fn(),
      simple: jest.fn(),
      printf: jest.fn(),
      json: jest.fn(),
    },
    transports: {
      Console: jest.fn().mockImplementation(() => mockLogger),
      File: jest.fn().mockImplementation(() => mockLogger),
    },
  };
});

// Mock fs to avoid file system operations in tests
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockRejectedValue(new Error('Mocked error')),
  },
}));

// Mock path
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
}));

describe('Logger', () => {
  let mockWinstonLogger: any;
  let originalEnv: string | undefined;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Save and set test environment
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    // Get mock logger instance
    const winston = require('winston');
    mockWinstonLogger = winston.createLogger();
  });

  afterEach(() => {
    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.NODE_ENV = originalEnv;
    } else {
      delete process.env.NODE_ENV;
    }

    // Clear any cached modules
    jest.resetModules();
  });

  describe('createLogger in test environment', () => {
    it('should create a logger with all methods', () => {
      const logger = createLogger('test-service');

      expect(logger).toBeDefined();
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should log error messages', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('test-service');

      logger.error('Error message', { key: 'value' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] test-service: Error message',
        { key: 'value' }
      );

      consoleErrorSpy.mockRestore();
    });

    it('should log warning messages', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const logger = createLogger('test-service');

      logger.warn('Warning message', { key: 'value' });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[WARN] test-service: Warning message',
        { key: 'value' }
      );

      consoleWarnSpy.mockRestore();
    });

    it('should log info messages', () => {
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
      const logger = createLogger('test-service');

      logger.info('Info message', { key: 'value' });

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '[INFO] test-service: Info message',
        { key: 'value' }
      );

      consoleInfoSpy.mockRestore();
    });

    it('should log debug messages', () => {
      const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
      const logger = createLogger('test-service');

      logger.debug('Debug message', { key: 'value' });

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[DEBUG] test-service: Debug message',
        { key: 'value' }
      );

      consoleDebugSpy.mockRestore();
    });

    it('should handle log without metadata', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('test-service');

      logger.error('Error message');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] test-service: Error message'
      );

      consoleErrorSpy.mockRestore();
    });

    it('should create separate loggers for different services', () => {
      const logger1 = createLogger('service1');
      const logger2 = createLogger('service2');

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      logger1.error('Error from service1');
      logger2.error('Error from service2');

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR] service1: Error from service1');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR] service2: Error from service2');

      consoleErrorSpy.mockRestore();
    });

    it('should not log when environment is not test', async () => {
      const winston = require('winston');
      process.env.NODE_ENV = 'development';

      // Need to re-require module to apply new environment
      jest.resetModules();
      const { createLogger: createLoggerDev } = await import('@/lib/logger');
      const logger = createLoggerDev('test-service');

      logger.error('Test error');

      // In development, should use Winston logger instead of console
      expect(winston.createLogger).toHaveBeenCalled();
      expect(mockWinstonLogger.error).toHaveBeenCalled();

      process.env.NODE_ENV = 'test';
    });
  });

  describe('Log levels', () => {
    it('should support error level', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('test-service');

      logger.error('Error message');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] test-service:')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should support warn level', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const logger = createLogger('test-service');

      logger.warn('Warning message');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN] test-service:')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should support info level', () => {
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
      const logger = createLogger('test-service');

      logger.info('Info message');

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] test-service:')
      );

      consoleInfoSpy.mockRestore();
    });

    it('should support debug level', () => {
      const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
      const logger = createLogger('test-service');

      logger.debug('Debug message');

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] test-service:')
      );

      consoleDebugSpy.mockRestore();
    });
  });

  describe('Service naming', () => {
    it('should include service name in logs', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('my-service');

      logger.error('Test error');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('my-service:')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle service names with special characters', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('service-name_with.special');

      logger.error('Test error');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('service-name_with.special:')
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle service names with unicode', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('サービス');

      logger.error('Test error');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('サービス:')
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Metadata handling', () => {
    it('should log with metadata', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('test-service');

      logger.error('Error message', { userId: '123', action: 'create' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] test-service: Error message',
        { userId: '123', action: 'create' }
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle empty metadata', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('test-service');

      logger.error('Error message', {});

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] test-service: Error message',
        expect.any(Object)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle complex metadata', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('test-service');

      const complexMeta = {
        user: { id: 123, name: 'Test User' },
        request: { method: 'POST', url: '/api/users' },
        timestamp: Date.now(),
      };

      logger.error('Error message', complexMeta);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] test-service: Error message',
        complexMeta
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle null metadata', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('test-service');

      logger.error('Error message', null);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] test-service: Error message',
        null
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle undefined metadata', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('test-service');

      logger.error('Error message', undefined);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] test-service: Error message',
        undefined
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Message formatting', () => {
    it('should handle empty messages', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('test-service');

      logger.error('');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] test-service: '
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle very long messages', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('test-service');

      const longMessage = 'x'.repeat(10000);
      logger.error(longMessage);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[ERROR] test-service: ${longMessage}`
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle special characters in messages', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('test-service');

      const specialMessage = 'Error: \n\t\r"\'`<script>alert(1)</script>';
      logger.error(specialMessage);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[ERROR] test-service: ${specialMessage}`
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle unicode characters', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('test-service');

      const unicodeMessage = 'エラー発生: 💥';
      logger.error(unicodeMessage);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[ERROR] test-service: ${unicodeMessage}`
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle emojis', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('test-service');

      const emojiMessage = 'Error 😱 Something went wrong 💔';
      logger.error(emojiMessage);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `[ERROR] test-service: ${emojiMessage}`
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Edge cases', () => {
    it('should handle service name as empty string', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('');

      logger.error('Test error');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] : Test error'
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle very long service name', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const longServiceName = 'very-long-service-name-'.repeat(10);
      const logger = createLogger(longServiceName);

      logger.error('Test error');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[ERROR] ${longServiceName}:`)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle numeric metadata values', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('test-service');

      logger.error('Error', { count: 123, percentage: 45.67 });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] test-service: Error',
        { count: 123, percentage: 45.67 }
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle boolean metadata values', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('test-service');

      logger.error('Error', { success: false, isAdmin: true });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] test-service: Error',
        { success: false, isAdmin: true }
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle array metadata values', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const logger = createLogger('test-service');

      logger.error('Error', { items: [1, 2, 3], names: ['a', 'b', 'c'] });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ERROR] test-service: Error',
        { items: [1, 2, 3], names: ['a', 'b', 'c'] }
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
