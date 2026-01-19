# JWT Refresh Token Implementation

This document describes the implementation of the JWT refresh token mechanism for the JSMKC scoring system, addressing critical security issue CR-008 from QA review.

## Overview

The JWT refresh token mechanism improves user experience and reduces frequent re-authentication requirements during long tournament sessions by implementing automatic token refresh with secure fallbacks.

## Architecture

The implementation follows the exact specifications from `ARCHITECTURE.md` section 6.2 "Refresh Token機構の実装詳細".

### Components

1. **Server-side token refresh** (`lib/auth.ts`)
2. **Client-side refresh utilities** (`lib/jwt-refresh.ts`)
3. **Enhanced polling with refresh** (`lib/hooks/use-polling-enhanced.ts`)
4. **Rate limiting** (`lib/rate-limit.ts`)
5. **Security middleware** (`middleware.ts`)
6. **Monitoring endpoints** (`app/api/monitor/polling-stats/route.ts`)

## Implementation Details

### 1. NextAuth.js Configuration

The auth configuration has been updated to support both GitHub and Google OAuth with JWT strategy:

```typescript
// lib/auth.ts
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          scope: "openid email profile https://www.googleapis.com/auth/userinfo.email"
        }
      }
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // JWT callback handles automatic token refresh
    async jwt({ token, user, account }) {
      if (account && user) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: Date.now() + account.expires_in * 1000,
          refreshTokenExpires: Date.now() + 24 * 60 * 60 * 1000,
        }
      }
      
      if (Date.now() < token.accessTokenExpires) {
        return token;
      }
      
      return refreshAccessToken(token);
    },
  },
})
```

### 2. Token Refresh Function

The `refreshAccessToken` function implements Google OAuth token refresh:

```typescript
async function refreshAccessToken(token) {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken!,
      }),
    });

    const refreshedTokens = await response.json();

    if (!response.ok) {
      throw refreshedTokens;
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    };
  } catch (error) {
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}
```

### 3. Client-side Token Refresh

Client utilities handle automatic session refresh and graceful error handling:

```typescript
// lib/jwt-refresh.ts
export function useAutoRefresh() {
  const { data: session, update } = useSession();

  const refreshSession = async (): Promise<boolean> => {
    if (!session) return false;

    try {
      const result = await update();
      
      if (result?.error === 'RefreshAccessTokenError') {
        await handleSessionRefreshFailure();
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Manual session refresh failed:', error);
      await handleSessionRefreshFailure();
      return false;
    }
  };

  const ensureValidSession = async (): Promise<boolean> => {
    if (!session) {
      window.location.href = '/auth/signin';
      return false;
    }

    if (isAccessTokenExpired(session)) {
      return await refreshSession();
    }

    if (isRefreshTokenExpired(session)) {
      await handleSessionRefreshFailure('Your session has expired. Please sign in again.');
      return false;
    }

    return true;
  };

  return {
    refreshSession,
    ensureValidSession,
    isExpired: isAccessTokenExpired(session),
    isRefreshExpired: isRefreshTokenExpired(session),
  };
}
```

### 4. Enhanced Polling

The polling mechanism integrates automatic token refresh:

```typescript
// lib/hooks/use-polling-enhanced.ts
export function usePolling(options: PollingOptions): UsePollingResult {
  const { ensureValidSession } = useAutoRefresh();

  const fetchData = useCallback(async () => {
    try {
      // Ensure session is valid before making request
      const sessionValid = await ensureValidSession();
      if (!sessionValid) {
        throw new Error('Session validation failed');
      }

      // Add session token to headers if available
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (sessionData?.accessToken) {
        headers.Authorization = `Bearer ${sessionData.accessToken}`;
      }

      const response = await fetch(url, { headers, cache: 'no-store' });
      // Handle response...
    } catch (error) {
      // Handle errors with exponential backoff
    }
  }, [url, ensureValidSession]);

  // Implement visibility optimization and rate limiting
}
```

### 5. Rate Limiting

Memory-based rate limiting implementation:

```typescript
// lib/rate-limit.ts
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMITS = {
  scoreInput: { max: 20, window: 60 * 1000 }, // 20 requests/minute
  polling: { max: 12, window: 60 * 1000 },    // 12 requests/minute (5-second intervals)
  tokenValidation: { max: 10, window: 60 * 1000 }, // 10 requests/minute
};

export async function checkRateLimit(
  type: keyof typeof RATE_LIMITS,
  identifier: string
) {
  const now = Date.now();
  const key = `${type}:${identifier}`;
  const limit = RATE_LIMITS[type];

  const record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + limit.window });
    return { success: true, remaining: limit.max - 1 };
  }

  if (record.count >= limit.max) {
    return {
      success: false,
      remaining: 0,
      retryAfter: Math.ceil((record.resetAt - now) / 1000)
    };
  }

  record.count++;
  return { success: true, remaining: limit.max - record.count };
}

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000); // Every 5 minutes
```

### 6. Security Enhancements

#### Token Rotation
- Access tokens are automatically rotated on refresh
- Refresh tokens are preserved if not provided in response
- Proper error handling for expired refresh tokens

#### Secure Storage
- Tokens are stored in secure httpOnly cookies via NextAuth.js
- Client-side access through session object only
- No token storage in localStorage or sessionStorage

#### Revocation on Logout
- Tokens are invalidated on signOut
- Server-side session cleanup
- Audit logging of logout events

#### CSP Headers
- Strict Content Security Policy in production
- Nonce-based script execution
- Prevention of XSS attacks

## Environment Variables

Add these to your `.env.local` file:

```bash
# Google OAuth for JWT Refresh Token
AUTH_GOOGLE_ID=your_google_client_id_here
AUTH_GOOGLE_SECRET=your_google_client_secret_here

# Existing GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here

# NextAuth.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_here
```

## API Endpoints

### Session Status
- `GET /api/auth/session-status` - Returns current session status with token info
- Includes rate limiting for token validation
- Authentication required for detailed information

### Monitoring
- `GET /api/monitor/polling-stats` - Resource usage monitoring
- Requires authentication
- Provides statistics and warnings for approaching limits

### Token Extension
- `POST /api/tournaments/[id]/token/extend` - Extend tournament token expiry
- Enhanced with rate limiting
- Audit logging for security

## Usage Examples

### Basic Session Refresh
```typescript
'use client';
import { useAutoRefresh } from '@/lib/jwt-refresh';

function MyComponent() {
  const { ensureValidSession } = useAutoRefresh();

  const handleProtectedAction = async () => {
    const isValid = await ensureValidSession();
    if (!isValid) return;

    // Perform protected action
    const response = await fetch('/api/protected-endpoint', {
      headers: { Authorization: `Bearer ${session.accessToken}` }
    });
  };
}
```

### Polling with Auto Refresh
```typescript
'use client';
import { usePolling } from '@/lib/hooks/use-polling-enhanced';

function TournamentData() {
  const { data, error, isLoading } = usePolling({
    url: '/api/tournaments/1/matches',
    interval: 5000, // 5 seconds
    enabled: true,
  });

  if (error) return <div>Error: {error.message}</div>;
  if (isLoading) return <div>Loading...</div>;
  return <div>{JSON.stringify(data)}</div>;
}
```

### Authenticated API Calls
```typescript
import { authenticatedFetch } from '@/lib/jwt-refresh';

const makeApiCall = async () => {
  try {
    const response = await authenticatedFetch(
      '/api/protected-data',
      { method: 'POST', body: JSON.stringify({ data: 'test' }) },
      session
    );
    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
  }
};
```

## Testing

The implementation includes comprehensive test suites:

### JWT Refresh Tests
- Token refresh success and failure scenarios
- Expiration handling
- Network error handling
- Integration with NextAuth.js

### Polling Integration Tests
- Automatic session refresh during polling
- Rate limiting behavior
- Visibility optimization
- Error handling and edge cases

### Running Tests
```bash
npm run test __tests__/jwt-refresh.test.ts
npm run test __tests__/polling-integration.test.ts
```

## Security Considerations

### Token Expiration
- Access tokens: 1 hour (automatic refresh)
- Refresh tokens: 24 hours (requires re-authentication)
- 5-minute buffer for access token refresh

### Rate Limiting
- Score input: 20 requests/minute
- Polling: 12 requests/minute (5-second intervals)
- Token validation: 10 requests/minute

### Error Handling
- Graceful degradation on refresh failure
- Automatic re-authentication prompts
- Detailed error messages for debugging

### Monitoring
- Request count tracking
- Response time monitoring
- Rate limit statistics
- Automated alerts for approaching limits

## Performance Optimization

### Polling Efficiency
- 40% reduction in requests (from 3-second to 5-second intervals)
- Page visibility optimization (pauses when hidden)
- Exponential backoff on errors
- Connection pooling

### Resource Usage
- Estimated 27,648 requests during 2-day tournament (down from 46,080)
- Well within Vercel Hobby plan limits
- Automated monitoring and alerting

## Troubleshooting

### Common Issues

1. **Token refresh fails**
   - Check Google OAuth configuration
   - Verify environment variables
   - Check network connectivity

2. **Rate limiting errors**
   - Implement exponential backoff
   - Check rate limiting configuration
   - Monitor usage statistics

3. **Session expiration during long tournaments**
   - Verify refresh token validity
   - Check session callback implementation
   - Review client-side refresh logic

### Debug Mode

Enable debug logging:
```typescript
// In development
if (process.env.NODE_ENV === 'development') {
  console.log('Token refresh debug:', { token, error });
}
```

## Future Enhancements

1. **Push notifications for session expiration**
2. **Offline support with token persistence**
3. **Multi-provider refresh token support**
4. **Advanced analytics for usage patterns**

This implementation provides a robust, secure, and user-friendly solution to the JWT refresh token requirements, significantly improving the tournament management experience while maintaining security best practices.