# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JSMKC (Japan Super Mario Kart Championship) is a tournament management and scoring system for competitive Super Mario Kart events. Built with Next.js 16 (App Router) and React 19.

## Development Commands

All commands run from `jsmkc-app/` directory:

```bash
npm run dev              # Start development server
npm run build            # Build for production
npm run lint             # Run ESLint
npm test                 # Run Jest tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report (70% minimum threshold)
npm run test:e2e         # Playwright E2E tests
npm run test:e2e:headed  # E2E with visible browser
```

Run a single test file:
```bash
npm test -- path/to/test.ts
npm test -- --testNamePattern="specific test name"
```

## Architecture

### Competition Modes

The system supports 4 competitive modes, each with qualification and finals phases:

- **TA (Time Attack)**: Individual races on 20 courses with losers round and life-based finals
- **BM (Battle Mode)**: 1v1 balloon-popping with group round-robin qualification and double elimination finals
- **MR (Match Race)**: 1v1 random course races with similar bracket structure to BM
- **GP (Grand Prix)**: 1v1 cup-based scoring with driver points (9, 6, 3, 1 for 1st-4th)

### API Route Pattern

API routes follow a consistent pattern with function-level logger creation:

```typescript
// Correct pattern: logger inside function (for proper test mocking)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const logger = createLogger('api-name');
  const { id } = await params;

  try {
    // Implementation with structured logging
    logger.info('Operation description', { tournamentId: id });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error description', { error, tournamentId: id });
    return NextResponse.json({ success: false, error: 'User-friendly message' }, { status: 500 });
  }
}
```

### Key Directories

```
jsmkc-app/src/
├── app/api/                    # 46 API routes organized by feature
│   ├── tournaments/[id]/
│   │   ├── ta/                 # Time Attack endpoints
│   │   ├── bm/                 # Battle Mode endpoints
│   │   ├── mr/                 # Match Race endpoints
│   │   ├── gp/                 # Grand Prix endpoints
│   │   └── tt/                 # Tournament Token endpoints
├── lib/                        # Shared utilities
│   ├── prisma.ts               # Database client singleton
│   ├── logger.ts               # Winston structured logging
│   ├── rate-limit.ts           # Redis-backed rate limiting
│   ├── double-elimination.ts   # Finals bracket generation
│   └── auth.ts                 # NextAuth v5 configuration
└── components/
    ├── ui/                     # Radix UI wrapped components
    └── tournament/             # Tournament-specific components
```

### Authentication

- **Admin operations**: OAuth (GitHub/Google/Discord) via NextAuth v5
- **Player score entry**: Token-based access without authentication
- **Session**: JWT strategy with refresh tokens

### Database

- PostgreSQL via Prisma ORM
- Soft delete pattern (deletedAt field)
- Optimistic locking (version field) for concurrent updates

## Testing

### Mock Pattern

Tests use manual mock files in `__mocks__/lib/`. Access mocks via `jest.requireMock()`:

```typescript
// Correct pattern for accessing mocks
const rateLimitMock = jest.requireMock('@/lib/rate-limit') as {
  checkRateLimit: jest.Mock;
};
rateLimitMock.checkRateLimit.mockResolvedValue({ success: true });
```

### Global Mocks (jest.setup.js)

- Prisma client with all model methods
- NextAuth session/providers
- NextResponse/NextRequest polyfills
- Element.scrollIntoView for Radix UI

## Code Requirements

### LAW
- Detailed comments must be included in the source code to justify the implementation of such logic

### API Response Format

```typescript
// Success
{ success: true, data: {...} }

// Error
{ success: false, error: "User-friendly message" }
```

### HTTP Status Codes

| Code | Usage |
|------|-------|
| 200 | Success |
| 400 | Validation error |
| 401 | Authentication required |
| 403 | Authorization denied |
| 404 | Resource not found |
| 409 | Optimistic lock conflict |
| 429 | Rate limit exceeded |
| 500 | Server error |

## Documentation

- `docs/ARCHITECTURE.md` - Detailed system design
- `docs/requirements.md` - Functional requirements
- `docs/JEST_MOCK_FIX_PATTERN.md` - Test mock patterns
