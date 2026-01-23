import '@testing-library/jest-dom'

// Polyfill Response.json BEFORE any imports to ensure it's available for Next.js
if (!global.Response) {
  class Response {
    constructor(body, init = {}) {
      this.body = body
      this.status = init.status || 200
      this.statusText = init.statusText || 'OK'
      this.headers = new Headers(init.headers || {})
      this.type = 'default'
      this.url = ''
      this.ok = this.status >= 200 && this.status < 300
      this.redirected = false
      this.used = false
    }

    static json(data, init = {}) {
      const body = JSON.stringify(data)
      return new Response(body, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers || {}),
        },
      })
    }

    async json() {
      return JSON.parse(this.body)
    }

    async text() {
      return this.body
    }
  }

  global.Response = Response
}

if (!Response.json) {
  Response.json = function (data, init = {}) {
    const body = JSON.stringify(data)
    return new Response(body, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    })
  }
}

// Polyfill crypto.randomUUID and crypto.getRandomValues for Jest environment
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    },
    getRandomValues: (arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
  },
  writable: true,
})

// Mock Element.prototype.scrollIntoView for Radix UI Select components
// Radix UI uses scrollIntoView for positioning and focus management
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = jest.fn();
}

// Polyfill TextEncoder and TextDecoder using global util module
// Note: require() is used here intentionally for Jest setup
// eslint-disable-next-line @typescript-eslint/no-require-imports
const util = require('util');
if (!global.TextEncoder) {
  global.TextEncoder = util.TextEncoder;
}
if (!global.TextDecoder) {
  global.TextDecoder = util.TextDecoder;
}

// Mock Prisma client globally - optimized to minimize overhead
jest.mock('@/lib/prisma', () => {
  const createMockModel = () => ({
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  })

  const createMockModelWithMethods = () => ({
    ...createMockModel(),
    count: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
  })

  return {
    __esModule: true,
    default: {
      tournament: createMockModelWithMethods(),
      accessToken: createMockModel(),
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      player: createMockModelWithMethods(),
      account: {
        findUnique: jest.fn(),
      },
      session: {
        findUnique: jest.fn(),
      },
      bMMatch: createMockModelWithMethods(),
      bMQualification: createMockModelWithMethods(),
      mRMatch: createMockModelWithMethods(),
      mRQualification: createMockModelWithMethods(),
      gPMatch: createMockModelWithMethods(),
      gPQualification: createMockModelWithMethods(),
      tTEntry: createMockModelWithMethods(),
      scoreEntryLog: {
        findMany: jest.fn(),
      },
      matchCharacterUsage: {
        findMany: jest.fn(),
      },
    },
  }
})

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
