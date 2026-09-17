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

import { useRef, useState } from 'react';
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
  /**
   * Increments on every open/close transition. All async dialog work captures
   * the current value so a response from a previous dialog session cannot
   * mutate the state of a later session.
   */
  const dialogSessionRef = useRef(0);
  /**
   * Separately orders status GETs inside one dialog session. A mutation that
   * outlives its original dialog can start a post-settle status refresh; that
   * later request must win even if an earlier reopen GET returns afterwards.
   */
  const statusRequestRef = useRef(0);

  const loginUrl = rawToken ? buildLoginUrl(rawToken) : null;
  const isCurrentDialogSession = (dialogSession: number) => dialogSessionRef.current === dialogSession;
  const isCurrentStatusRequest = (dialogSession: number, statusRequest: number) =>
    isCurrentDialogSession(dialogSession) && statusRequestRef.current === statusRequest;

  const generateQrImage = async (url: string, dialogSession: number) => {
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1 });
    if (!isCurrentDialogSession(dialogSession)) return;
    setQrImageUrl(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
  };

  const fetchStatus = async (dialogSession: number) => {
    if (!isCurrentDialogSession(dialogSession)) return;
    const statusRequest = statusRequestRef.current + 1;
    statusRequestRef.current = statusRequest;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/players/${playerId}/qr-login-token`);
      if (!isCurrentStatusRequest(dialogSession, statusRequest)) return;

      if (res.ok) {
        const json = await res.json();
        if (!isCurrentStatusRequest(dialogSession, statusRequest)) return;
        setStatus(json.data ?? json);
      } else {
        setError(t('failedToLoadQrStatus'));
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message } : { error: err };
      logger.error('Failed to load QR login status', metadata);
      if (isCurrentStatusRequest(dialogSession, statusRequest)) setError(t('failedToLoadQrStatus'));
    } finally {
      if (isCurrentStatusRequest(dialogSession, statusRequest)) setLoading(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    const dialogSession = dialogSessionRef.current + 1;
    dialogSessionRef.current = dialogSession;
    setOpen(nextOpen);

    // Read-only status work from the previous dialog session may still be in
    // flight. The generation change above makes those updates stale, so the
    // new session owns its loading state immediately. Do not reset
    // `submitting` here: POST/DELETE mutations must stay serialized across a
    // close/reopen until the in-flight server mutation actually settles.
    setLoading(false);

    // The token and the generated QR both contain a one-time bearer
    // credential, so discard them immediately on every dialog transition.
    // Opening starts from a clean slate; closing does not retain plaintext in
    // hidden React state until the next open.
    setRawToken(null);
    setQrImageUrl(null);

    if (nextOpen) {
      setError('');
      void fetchStatus(dialogSession);
    }
  };

  const handleIssue = async (isReissue: boolean) => {
    if (isReissue && !confirm(t('confirmReissueQrCode'))) return;
    const dialogSession = dialogSessionRef.current;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/players/${playerId}/qr-login-token`, { method: 'POST' });
      if (!isCurrentDialogSession(dialogSession)) return;

      if (res.ok) {
        const json = await res.json();
        const data = json.data ?? json;

        // Closing (or close + reopen) invalidates the session that initiated
        // this request. Never re-introduce a raw bearer token into a later
        // dialog session when a slow response finally arrives.
        if (!isCurrentDialogSession(dialogSession)) return;

        setRawToken(data.token);
        setStatus({ active: true, issuedAt: data.issuedAt });
        await generateQrImage(buildLoginUrl(data.token), dialogSession);
      } else {
        setError(t('failedToIssueQrCode'));
      }
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message } : { error: err };
      logger.error('Failed to issue QR login token', metadata);
      if (isCurrentDialogSession(dialogSession)) setError(t('failedToIssueQrCode'));
    } finally {
      // `submitting` represents the one serialized server mutation, not a
      // dialog-session-local visual. Even if the dialog was reopened, this
      // request settling is what safely releases the mutation lock.
      setSubmitting(false);

      // If this mutation outlived the session that started it, the reopened
      // session may have loaded status before the server mutation committed.
      // Refresh after settle so the current session converges on server state.
      if (!isCurrentDialogSession(dialogSession)) {
        void fetchStatus(dialogSessionRef.current);
      }
    }
  };

  const handleRevoke = async () => {
    if (!confirm(t('confirmRevokeQrCode'))) return;
    const dialogSession = dialogSessionRef.current;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/players/${playerId}/qr-login-token`, { method: 'DELETE' });
      if (!isCurrentDialogSession(dialogSession)) return;

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
      if (isCurrentDialogSession(dialogSession)) setError(t('failedToRevokeQrCode'));
    } finally {
      setSubmitting(false);
      if (!isCurrentDialogSession(dialogSession)) {
        void fetchStatus(dialogSessionRef.current);
      }
    }
  };

  const selectLoginUrl = () => {
    const input = document.getElementById('qr-login-url') as HTMLInputElement | null;
    if (!input) return;
    input.focus();
    input.select();
  };

  const handleCopyLoginUrl = async () => {
    if (!loginUrl) return;

    if (!navigator.clipboard?.writeText) {
      selectLoginUrl();
      return;
    }

    try {
      await navigator.clipboard.writeText(loginUrl);
    } catch (err) {
      const metadata = err instanceof Error ? { message: err.message, stack: err.stack } : { error: err };
      logger.error('Failed to copy QR login URL', metadata);
      selectLoginUrl();
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
                  <Button type="button" variant="outline" onClick={() => void handleCopyLoginUrl()}>
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
