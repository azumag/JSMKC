# Authentication System Implementation Task

## Overview
Implement complete authentication system for JSMKC scoring system using NextAuth.js v5 with GitHub OAuth.

## Current State Analysis

### Already Implemented ✅
- NextAuth.js v5 installed (`next-auth@^5.0.0-beta.30`)
- Basic auth configuration in `jsmkc-app/src/lib/auth.ts`
- GitHub OAuth provider with organization validation
- Auth UI pages (sign-in and error)
- Middleware for route protection
- User model in Prisma schema
- AuditLog for tracking operations

### Missing Implementation ❌
1. **Prisma Schema Updates**: Missing NextAuth.js required models (Account, Session, VerificationToken)
2. **JWT Session Configuration**: Missing 24-hour expiration configuration
3. **Environment Variables**: Missing GitHub OAuth credentials
4. **API Route Protection**: Need to add auth() checks directly in protected routes
5. **Auth UI Components**: Need to add sign in/out buttons in navigation
6. **Environment Variable Documentation**: Need .env.example file

## Implementation Requirements

### 1. Prisma Schema Updates (`jsmkc-app/prisma/schema.prisma`)
Add NextAuth.js v5 required models:

```prisma
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

### 2. Auth Configuration Updates (`jsmkc-app/src/lib/auth.ts`)

#### Add JWT configuration with 24-hour expiration:
```typescript
session: {
  strategy: 'jwt',
  maxAge: 24 * 60 * 60, // 24 hours in seconds
},
```

#### Update session callback to include user data:
```typescript
async session({ session, token }) {
  if (session.user && token.sub) {
    session.user.id = token.sub;
    // Add any other user data needed
  }
  return session;
},
```

#### Improve signIn callback error handling:
- Add detailed error logging
- Return appropriate error messages for failed organization validation

### 3. Environment Variables

#### Update `.env.local`:
```
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_here
```

#### Create `.env.example`:
```
# Database
DATABASE_URL=your_database_url_here

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here

# NextAuth.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_here
```

### 4. API Route Protection

Update the following routes to use `auth()` function directly:

#### `jsmkc-app/src/app/api/tournaments/route.ts`:
- POST (create tournament) - requires auth
- GET - public access

#### `jsmkc-app/src/app/api/tournaments/[id]/route.ts`:
- PUT (update) - requires auth
- DELETE - requires auth
- GET - public access

#### `jsmkc-app/src/app/api/players/[id]/route.ts`:
- PUT (update) - requires auth
- DELETE - requires auth
- GET - public access

#### All game mode routes (bm, mr, gp, ta):
- POST (create) - requires auth
- PUT (update) - requires auth
- DELETE -requires auth
- GET - public access
- POST for match score entry (e.g., `/match/[matchId]/report`) - public access

#### Example pattern for protected routes:
```typescript
import { auth } from '@/lib/auth'

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }
  
  // Rest of the implementation
}
```

### 5. Auth UI Components

#### Add to `jsmkc-app/src/app/layout.tsx`:
- Sign in/out button in navigation
- Display current user info when authenticated
- Show "Admin" badge for authenticated users

#### Create `jsmkc-app/src/components/auth/user-menu.tsx`:
- Dropdown menu with user info
- Sign out button

### 6. Middleware Updates

The middleware at `jsmkc-app/src/middleware.ts` is mostly correct, but:
- Verify it's protecting the correct routes
- Ensure it's not blocking public access for score entry
- Test that it properly handles authenticated vs unauthenticated requests

### 7. Database Migration

After updating Prisma schema:
```bash
npx prisma migrate dev --name add_nextauth_models
```

## Architecture Specifications (from docs/architecture.md)

### Authentication Requirements
- **Provider**: GitHub OAuth (NextAuth.js v5)
- **Allowed Users**: GitHub Organization members only (`jsmkc-org`)
- **Session Type**: JWT
- **Session Expiration**: 24 hours
- **Required For**:
  - Tournament create/edit/delete
  - Player edit/delete
  - Match result edit/delete
  - Token issue/invalidation
- **Not Required For**:
  - Score viewing (public)
  - Score reporting (public with token)

### Security Requirements
- GitHub Organization validation using API
- JWT sessions with proper expiration
- Audit logging for all operations
- Rate limiting for public endpoints
- Security headers (CSP, X-Frame-Options, etc.)

## Testing Checklist

- [ ] User can sign in with GitHub
- [ ] Non-organization members cannot sign in
- [ ] Authenticated users can create tournaments
- [ ] Unauthenticated users cannot create tournaments
- [ ] Public users can view tournaments
- [ ] Public users can report scores (if token exists)
- [ ] Session expires after 24 hours
- [ ] Sign out works correctly
- [ ] All protected API routes return 401 for unauthenticated requests
- [ ] Audit logs are created for operations

## Files to Modify/Create

### Modify:
1. `jsmkc-app/prisma/schema.prisma` - Add NextAuth models
2. `jsmkc-app/src/lib/auth.ts` - Add JWT configuration
3. `jsmkc-app/src/middleware.ts` - Review and adjust
4. `jsmkc-app/src/app/api/tournaments/route.ts` - Add auth check
5. `jsmkc-app/src/app/api/tournaments/[id]/route.ts` - Add auth check
6. `jsmkc-app/src/app/api/players/[id]/route.ts` - Add auth check
7. `jsmkc-app/src/app/api/tournaments/[id]/*/route.ts` - Add auth checks for all game modes
8. `jsmkc-app/src/app/layout.tsx` - Add auth UI
9. `jsmkc-app/.env.local` - Add environment variables

### Create:
1. `jsmkc-app/src/components/auth/user-menu.tsx` - User menu component
2. `jsmkc-app/.env.example` - Environment variable template

### Run:
1. `npx prisma migrate dev` - Create database migration

## Notes

1. **GitHub OAuth Setup**: The developer needs to create a GitHub OAuth App with:
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github` (dev) and production URL
   - Read permissions: read:user, read:org

2. **NEXTAUTH_SECRET**: Generate using `openssl rand -base64 32`

3. **Organization Validation**: The current implementation uses `/user/orgs` API which works, but could be improved with error handling

4. **Code Review Checklist** (from CLAUDE.md):
   - No code duplication
   - Concise implementation
   - No unnecessary files
   - Good usability
   - No security risks
   - Cost-effective implementation

5. **Commit**: After implementation, commit with message "Implement complete authentication system with NextAuth.js v5 and GitHub OAuth"

6. **Push**: Push changes to remote repository

## Dependencies Already Installed
- next-auth@^5.0.0-beta.30 ✅

## Additional Dependencies Needed
- None (all required packages are already installed)
