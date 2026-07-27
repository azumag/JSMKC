/**
 * QrLoginDialog - QR One-Scan Login management (issue #3055)
 *
 * Lets a player (for their own account) or an admin (for any account)
 * issue, reissue, revoke, and print a player's QR one-scan login code.
 *
 * The QR image is generated entirely client-side (via the `qrcode`
 * package's SVG renderer — no canvas dependency, no network calls) so the
 * raw bearer token embedded in it is never sent anywhere but the browser
 * that requested it. The server only ever returns the raw token once, in
 * the issue/reissue response (see /api/players/[id]/qr-login-token);
 * afterwards only its hash is retrievable, matching the same
 * "shown once" pattern used for temporary player passwords.
 */
'use client';

import { useState } from 'react';
import QRCode from 'qrcode';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { createLogger } from '@/lib/client-logger';

const logger = createLogger({ serviceName: 'qr-login-dialog' });

interface QrTokenStatus {
  active: boolean;
  issuedAt: string | null;
}

interface QrLoginDialogProps {
  playerId: string;
  playerNickname: string;
  /** Custom trigger element. Defaults to a translated outline button. */
  trigger?: React.ReactNode;
}

function buildLoginUrl(token: string): string {
  return `${window.location.origin}/auth/qr-login?token=${encodeURIComponent(token)}`;
}

export function QrLoginDialog({ playerId, playerNickname, trigger }: QrLoginDialogProps) {
  const t = useTranslations('players');
  const tc = useTranslations('common');

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<QrTokenStatus | null>(null);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loginUrl = rawToken ? buildLoginUrl(rawToken) : null;

  const generateQrImage = async (url: string) => {
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1 });
    setQrImageUrl(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
  };

  const fetchStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/players/${playerId}/qr-login-token`);
      if (res.ok) {
        const json = await res.json();
        setStatus(json.data ?? json);
      } else {
        setError(t('failedToLoadQrStatus'));
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message } : { error: err };
      logger.error('Failed to load QR login status', metadata);
      setError(t('failedToLoadQrStatus'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setRawToken(null);
      setQrImageUrl(null);
      setError('');
      fetchStatus();
    }
  };

  const handleIssue = async (isReissue: boolean) => {
    if (isReissue && !confirm(t('confirmReissueQrCode'))) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/players/${playerId}/qr-login-token`, { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        const data = json.data ?? json;
        setRawToken(data.token);
        setStatus({ active: true, issuedAt: data.issuedAt });
        await generateQrImage(buildLoginUrl(data.token));
      } else {
        setError(t('failedToIssueQrCode'));
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message } : { error: err };
      logger.error('Failed to issue QR login token', metadata);
      setError(t('failedToIssueQrCode'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async () => {
    if (!confirm(t('confirmRevokeQrCode'))) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/players/${playerId}/qr-login-token`, { method: 'DELETE' });
      if (res.ok) {
        setStatus({ active: false, issuedAt: null });
        setRawToken(null);
        setQrImageUrl(null);
      } else {
        setError(t('failedToRevokeQrCode'));
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message } : { error: err };
      logger.error('Failed to revoke QR login token', metadata);
      setError(t('failedToRevokeQrCode'));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Prints the QR code via a dedicated print window rather than the main
   * app's print stylesheet — the code is meant to be handed to a player
   * (or taken to a booth) as a standalone slip, not as a printout of the
   * whole page chrome.
   */
  const handlePrint = () => {
    if (!qrImageUrl) return;
    const printWindow = window.open('', '_blank', 'width=400,height=500');
    if (!printWindow) {
      setError(t('printPopupBlocked'));
      return;
    }

    // Built via DOM APIs (not document.write with interpolated markup):
    // playerNickname is free-form, admin-editable text, so setting it through
    // textContent/alt/title keeps it inert even if it contains HTML/script
    // — the print window would otherwise be an unsanitized-XSS injection point.
    const doc = printWindow.document;
    doc.title = playerNickname;
    doc.body.style.textAlign = 'center';
    doc.body.style.fontFamily = 'sans-serif';
    doc.body.style.padding = '2rem';

    const heading = doc.createElement('h1');
    heading.style.fontSize = '1.25rem';
    heading.textContent = playerNickname;

    const img = doc.createElement('img');
    img.src = qrImageUrl;
    img.width = 280;
    img.height = 280;
    img.alt = `${playerNickname} QR login`;

    doc.body.appendChild(heading);
    doc.body.appendChild(img);
    printWindow.focus();
    printWindow.print();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            {t('qrLogin')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('qrLoginTitle')}</DialogTitle>
          <DialogDescription>{t('qrLoginDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {error && <div className="text-red-500 text-sm">{error}</div>}

          {loading ? (
            <div className="text-sm text-muted-foreground">{tc('loading')}</div>
          ) : rawToken && qrImageUrl && loginUrl ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- locally generated data: URI, not an optimizable remote image */}
                <img src={qrImageUrl} alt={t('qrCodeAlt', { nickname: playerNickname })} width={220} height={220} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qr-login-url">{t('qrLoginUrl')}</Label>
                <div className="flex gap-2">
                  <Input id="qr-login-url" value={loginUrl} readOnly className="font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(loginUrl)}>
                    {tc('copy')}
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{t('qrCodeNote')}</p>
              <Button type="button" variant="outline" className="w-full" onClick={handlePrint}>
                {t('printQrCode')}
              </Button>
            </div>
          ) : status?.active ? (
            <p className="text-sm text-muted-foreground">{t('qrCodeActiveNote')}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('qrCodeNotIssued')}</p>
          )}
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button type="button" disabled={submitting || loading} onClick={() => handleIssue(!!status?.active)}>
            {submitting ? tc('saving') : status?.active ? t('reissueQrCode') : t('issueQrCode')}
          </Button>
          {status?.active && (
            <Button type="button" variant="destructive" disabled={submitting || loading} onClick={handleRevoke}>
              {t('revokeQrCode')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
