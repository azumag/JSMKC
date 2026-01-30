'use client';

/**
 * TournamentTokenManager Component
 *
 * Provides an admin UI for managing tournament access tokens. These tokens
 * enable participant score entry without requiring individual authentication.
 * The admin (authenticated via OAuth) can:
 *   - View the current token (masked by default for security)
 *   - Copy the token or participant URL to the clipboard
 *   - Regenerate the token (invalidating the previous one)
 *   - Extend the token's expiration by 24 hours
 *
 * Token-based access is a key part of the JSMKC authentication model:
 *   - Admin operations require OAuth (GitHub/Google/Discord) via NextAuth v5.
 *   - Player score entry uses a shared tournament token, distributed via URL.
 *   This design simplifies the participant experience at tournament venues
 *   where individual player accounts would be impractical.
 *
 * Export:
 *   - default export: TournamentTokenManager component.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, RefreshCw, Clock, Shield, Eye, EyeOff } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

/**
 * Props for TournamentTokenManager.
 *
 * @property tournamentId - The unique tournament identifier, used to
 *   construct API endpoints for token management operations.
 * @property initialToken - The current token value (if one exists),
 *   provided by the parent component from server data.
 * @property initialTokenExpiresAt - ISO 8601 date string for the token's
 *   expiration time. Used to calculate remaining time and validity.
 */
interface TournamentTokenManagerProps {
  tournamentId: string;
  initialToken?: string | null;
  initialTokenExpiresAt?: string | null;
}

/**
 * TournamentTokenManager - Admin interface for token lifecycle management.
 *
 * The component manages its own local state for the token and expiration,
 * initialized from server-provided props. This allows optimistic updates
 * after successful API calls without requiring a full page refresh.
 *
 * Security considerations:
 *   - The token is masked (displayed as bullet characters) by default.
 *   - Only authenticated users (checked via useSession) can see and manage tokens.
 *   - Unauthenticated users see a reduced UI with an access-denied message.
 *   - Token regeneration invalidates the old token server-side, so leaked
 *     tokens can be revoked by regenerating.
 */
export default function TournamentTokenManager({
  tournamentId,
  initialToken,
  initialTokenExpiresAt,
}: TournamentTokenManagerProps) {
  /**
   * Session hook from NextAuth. Used to determine if the current user
   * is authenticated and authorized to manage tokens.
   */
  const { data: session } = useSession();

  /**
   * Local state for the token value and expiration.
   * Initialized from props but updated locally after API mutations
   * to avoid unnecessary server round-trips for display updates.
   */
  const [token, setToken] = useState<string | null>(initialToken || null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(initialTokenExpiresAt || null);

  /** Whether to show the token in cleartext or masked with bullet characters */
  const [showToken, setShowToken] = useState(false);

  /** Loading states for the regenerate and extend API calls */
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isExtending, setIsExtending] = useState(false);

  /**
   * Authorization check: any authenticated user with a session is
   * considered authorized to manage tournament tokens. More granular
   * role-based checks could be added here if needed.
   */
  const isAuthorized = session?.user;

  /**
   * Token validity check: a token is valid only if it exists AND
   * its expiration date is in the future. Expired tokens are treated
   * as inactive and the "Extend" action is disabled.
   */
  const hasValidToken = token && tokenExpiresAt && new Date(tokenExpiresAt) > new Date();

  /**
   * Calculates a human-readable string describing the time remaining
   * until token expiration.
   *
   * Format examples:
   *   - "No expiry set" (no expiration date)
   *   - "Expired" (past expiration)
   *   - "2 days 5h remaining" (more than 24 hours)
   *   - "3h 45m remaining" (less than 24 hours)
   */
  const getTimeRemaining = () => {
    if (!tokenExpiresAt) return 'No expiry set';

    const now = new Date();
    const expiry = new Date(tokenExpiresAt);

    if (now >= expiry) return 'Expired';

    const diff = expiry.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    /** For durations over 24 hours, show days + remaining hours for clarity */
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} day${days > 1 ? 's' : ''} ${hours % 24}h remaining`;
    }

    return `${hours}h ${minutes}m remaining`;
  };

  /**
   * Copies the current token value to the system clipboard.
   * Uses the Clipboard API (navigator.clipboard.writeText) which
   * requires a secure context (HTTPS or localhost).
   * Shows a toast notification on success or failure.
   */
  const copyToClipboard = async () => {
    if (!token) return;

    try {
      await navigator.clipboard.writeText(token);
      toast.success('Token copied to clipboard');
    } catch {
      toast.error('Failed to copy token');
    }
  };

  /**
   * Regenerates the tournament token by calling the server API.
   * This creates a new token with a 24-hour expiration and invalidates
   * the previous token. Useful when:
   *   - The current token has been compromised or leaked.
   *   - Starting a new tournament session.
   *   - The previous token has expired and needs replacement.
   *
   * On success, updates local state with the new token and expiration.
   */
  const regenerateToken = async () => {
    if (!isAuthorized) return;

    setIsRegenerating(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/token/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresInHours: 24 }),
      });

      const data = await response.json();

      if (data.success) {
        /** Update local state with the new token from the server response */
        setToken(data.data.token);
        setTokenExpiresAt(data.data.expiresAt);
        toast.success('Token regenerated successfully');
      } else {
        toast.error(data.error || 'Failed to regenerate token');
      }
    } catch {
      toast.error('Failed to regenerate token');
    } finally {
      setIsRegenerating(false);
    }
  };

  /**
   * Extends the current token's expiration by 24 hours.
   * Only available when a valid (non-expired) token exists.
   * This is useful during long tournament sessions where the
   * initial 24-hour window is insufficient.
   *
   * On success, updates the local expiration state with the new date.
   */
  const extendToken = async () => {
    if (!isAuthorized) return;

    setIsExtending(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/token/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extensionHours: 24 }),
      });

      const data = await response.json();

      if (data.success) {
        /** Update local expiration with the server-calculated new expiry date */
        setTokenExpiresAt(data.data.newExpiryDate);
        toast.success('Token extended by 24 hours');
      } else {
        toast.error(data.error || 'Failed to extend token');
      }
    } catch {
      toast.error('Failed to extend token');
    } finally {
      setIsExtending(false);
    }
  };

  /**
   * Constructs the full participant score entry URL.
   * This URL is what admins share with tournament participants.
   * It includes the token as a query parameter so participants
   * can access score entry directly without logging in.
   *
   * Uses window.location.origin to ensure the URL is correct
   * regardless of the deployment environment (dev, staging, prod).
   */
  const getParticipantUrl = () => {
    if (!token) return '';
    const baseUrl = window.location.origin;
    return `${baseUrl}/tournaments/${tournamentId}/participant?token=${token}`;
  };

  /**
   * Render a minimal card for unauthenticated users.
   * Token management requires admin-level authentication,
   * so unauthenticated visitors see an access-denied message.
   */
  if (!isAuthorized) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Token Access
          </CardTitle>
          <CardDescription>
            Tournament token management requires authentication
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  /**
   * Full authenticated UI with token display, actions, and security notice.
   */
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Tournament Token Management
          </CardTitle>
          <CardDescription>
            Manage secure access tokens for participant score entry
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Token Status Section: shows active/inactive badge and time remaining */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Token Status</p>
              <Badge variant={hasValidToken ? "default" : "destructive"}>
                {hasValidToken ? 'Active' : 'Inactive/Expired'}
              </Badge>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">Time Remaining</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {getTimeRemaining()}
              </p>
            </div>
          </div>

          {/*
           * Token Display Section: shows the token value (masked or cleartext)
           * with toggle visibility and copy-to-clipboard actions.
           * Only rendered when a token exists.
           */}
          {token && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Token:</p>
                <div className="flex-1 flex items-center gap-2">
                  {/*
                   * The token is masked with 32 bullet characters by default
                   * to prevent shoulder-surfing at tournament venues.
                   */}
                  <code className="bg-muted px-2 py-1 rounded text-sm font-mono flex-1">
                    {showToken ? token : '\u2022'.repeat(32)}
                  </code>
                  {/* Toggle token visibility */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  {/* Copy token to clipboard */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyToClipboard}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/*
           * Participant URL Section: shows the full shareable URL that
           * participants use to access score entry. Includes a copy button.
           * Only rendered when a token exists.
           */}
          {token && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Participant Score Entry URL:</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={getParticipantUrl()}
                  readOnly
                  className="flex-1 px-2 py-1 text-sm bg-muted border rounded"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(getParticipantUrl())}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Action Buttons: regenerate and extend token */}
          <div className="flex gap-2 pt-4">
            {/*
             * Regenerate creates a new token, invalidating the old one.
             * The spinner animation provides visual feedback during the API call.
             */}
            <Button
              onClick={regenerateToken}
              disabled={isRegenerating || !isAuthorized}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
              Regenerate Token
            </Button>
            {/*
             * Extend adds 24 hours to the current expiration.
             * Disabled when no valid token exists (nothing to extend).
             * The pulse animation provides visual feedback during the API call.
             */}
            <Button
              onClick={extendToken}
              disabled={isExtending || !isAuthorized || !hasValidToken}
              variant="outline"
              size="sm"
            >
              <Clock className={`h-4 w-4 mr-2 ${isExtending ? 'animate-pulse' : ''}`} />
              Extend by 24h
            </Button>
          </div>

          {/*
           * Security Notice: informs admins about token security best practices.
           * This is always visible to remind admins of their responsibility
           * when distributing tokens to tournament participants.
           */}
          <div className="text-xs text-muted-foreground bg-muted p-3 rounded">
            <p className="font-medium mb-1">Security Notice:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Tokens provide access to score entry for all participants</li>
              <li>Only share this URL with authorized tournament participants</li>
              <li>Token validation attempts are logged for security</li>
              <li>Regenerate the token if you suspect unauthorized access</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
