// jest-dom matchers are only loaded in jsdom environment.
// Add /** @jest-environment jsdom */ docblock to test files that need DOM APIs.
if (typeof window !== 'undefined') {
  require('@testing-library/jest-dom')
}

// Polyfill Response.json BEFORE any imports to ensure it's available for Next.js
class ResponsePolyfill {
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
    return new ResponsePolyfill(body, {
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

// Add Response polyfill globally for Node.js environment
if (typeof global.Response === 'undefined') {
  global.Response = ResponsePolyfill
}

// Also add to window for browser-like environment
if (typeof window !== 'undefined' && !window.Response) {
  window.Response = ResponsePolyfill
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
if (typeof Element !== 'undefined' && Element.prototype && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = jest.fn();
}

// Polyfill TextEncoder and TextDecoder using global util module
// Note: require() is used here intentionally for Jest setup
// eslint-disable-next-line @typescript-eslint/no-require-imports
const util = require('util');
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = util.TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = util.TextDecoder;
}

// Mock Prisma client globally - optimized to minimize overhead
// Provides both default and named `prisma` export to match src/lib/prisma.ts
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
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  })

  // Single mock instance shared by both default and named exports
  const mockPrisma = {
    tournament: createMockModelWithMethods(),
    accessToken: createMockModel(),
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    player: createMockModelWithMethods(),
    user: createMockModelWithMethods(),
    account: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    session: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
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
      create: jest.fn(),
    },
    matchCharacterUsage: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  }

  return {
    __esModule: true,
    default: mockPrisma,
    prisma: mockPrisma,
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
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'location', {
    value: {
      href: '',
      assign: jest.fn(),
      replace: jest.fn(),
    },
    writable: true,
  })
}

// Mock next/server to fix Response.json issue
jest.mock('next/server', () => {
  const mockJson = jest.fn((body, init) => {
    const status = init?.status || 200
    const response = new global.Response(JSON.stringify(body), {
      status,
      statusText: init?.statusText || 'OK',
      headers: new Headers({
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      }),
    })
    return response
  })

  return {
    NextResponse: {
      json: mockJson,
    },
    NextRequest: class {
      constructor(urlOrRequest, init) {
        if (typeof urlOrRequest === 'string') {
          this.url = urlOrRequest
          this.headers = new Headers(init?.headers)
          this.method = init?.method || 'GET'
          this.body = init?.body
        } else {
          this.url = urlOrRequest.url
          this.headers = urlOrRequest.headers
          this.method = urlOrRequest.method
          this.body = urlOrRequest.body
        }
      }

      async json() {
        return JSON.parse(this.body)
      }
    },
    __esModule: true,
  }
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
