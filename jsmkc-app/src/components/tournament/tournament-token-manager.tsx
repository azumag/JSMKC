'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, RefreshCw, Clock, Shield, Eye, EyeOff } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

interface TournamentTokenManagerProps {
  tournamentId: string;
  initialToken?: string | null;
  initialTokenExpiresAt?: string | null;
}

export default function TournamentTokenManager({
  tournamentId,
  initialToken,
  initialTokenExpiresAt,
}: TournamentTokenManagerProps) {
  const { data: session } = useSession();
  const [token, setToken] = useState<string | null>(initialToken || null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(initialTokenExpiresAt || null);

  const [showToken, setShowToken] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isExtending, setIsExtending] = useState(false);

  const isAuthorized = session?.user;
  const hasValidToken = token && tokenExpiresAt && new Date(tokenExpiresAt) > new Date();

  const getTimeRemaining = () => {
    if (!tokenExpiresAt) return 'No expiry set';
    
    const now = new Date();
    const expiry = new Date(tokenExpiresAt);
    
    if (now >= expiry) return 'Expired';
    
    const diff = expiry.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} day${days > 1 ? 's' : ''} ${hours % 24}h remaining`;
    }
    
    return `${hours}h ${minutes}m remaining`;
  };

  const copyToClipboard = async () => {
    if (!token) return;
    
    try {
      await navigator.clipboard.writeText(token);
      toast.success('Token copied to clipboard');
    } catch {
      toast.error('Failed to copy token');
    }
  };

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

  const getParticipantUrl = () => {
    if (!token) return '';
    const baseUrl = window.location.origin;
    return `${baseUrl}/tournaments/${tournamentId}/participant?token=${token}`;
  };

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
          {/* Token Status */}
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

          {/* Token Display */}
          {token && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Token:</p>
                <div className="flex-1 flex items-center gap-2">
                  <code className="bg-muted px-2 py-1 rounded text-sm font-mono flex-1">
                    {showToken ? token : '•'.repeat(32)}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
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

          {/* Participant URL */}
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

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button
              onClick={regenerateToken}
              disabled={isRegenerating || !isAuthorized}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
              Regenerate Token
            </Button>
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

          {/* Security Notice */}
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