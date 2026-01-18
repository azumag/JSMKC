import '@testing-library/jest-dom'

// Mock NextAuth.js
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
}))

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: '',
    assign: jest.fn(),
    replace: jest.fn(),
  },
  writable: true,
})

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Uncomment to ignore specific console.log messages
  // log: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
}

// Setup fetch polyfill if needed
if (!global.fetch) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  global.fetch = require('jest-fetch-mock')
}

// Clear all mocks before each test
beforeEach(() => {
  jest.clearAllMocks()
})