import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  // Provide path to your Next.js app to load next.config.js and .env files
  dir: './',
});

// Add any custom config to be passed to Jest
const customJestConfig: Config = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    // Handle module aliases (this will be automatically configured for you based on your tsconfig.json paths)
    '^@/(.*)$': '<rootDir>/src/$1',
    // Mock next-auth providers
    '^next-auth/providers/discord$': '<rootDir>/__mocks__/next-auth-providers/discord.js',
    '^next-auth/providers/github$': '<rootDir>/__mocks__/next-auth-providers/github.js',
    '^next-auth/providers/google$': '<rootDir>/__mocks__/next-auth-providers/google.js',
    '^next-auth/providers/credentials$': '<rootDir>/__mocks__/next-auth-providers/credentials.js',
  },
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.{js,jsx,ts,tsx}',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  // Performance optimizations
  maxWorkers: '50%',
  testTimeout: 30000,
  verbose: false,
  silent: true,
  // Enable Jest cache for faster subsequent runs
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  // Let next/jest handle TypeScript/JSX transpilation via SWC (no Babel config needed).
  // A root babel.config.js was previously used here but it interfered with
  // Next.js Turbopack builds, which also pick up project-level Babel configs.
  transformIgnorePatterns: [
    'node_modules/(?!(html-encoding-sniffer|@exodus|isomorphic-dompurify|jsdom)/)',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/', '__tests__/debug-', '__tests__/mock-debug'],
};

// createJestConfig is exported this way to ensure that next/jest can load Next.js config which is async
export default createJestConfig(customJestConfig);