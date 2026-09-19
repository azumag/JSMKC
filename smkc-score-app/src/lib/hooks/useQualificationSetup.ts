import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createLogger } from '@/lib/client-logger';
import type { SetupPlayer } from '@/lib/group-utils';

export type QualificationMode = 'bm' | 'mr' | 'gp';

interface UseQualificationSetupOptions {
  tournamentId: string;
  mode: QualificationMode;
  refetch: () => void | Promise<void>;
}

export interface QualificationSetupError {
  kind: 'validation' | 'server' | 'network';
  message: string;
  status?: number;
  code?: string;
}

export interface SubmitSetupResult {
  ok: boolean;
  error?: QualificationSetupError;
}

interface SetupErrorPayload {
  code?: unknown;
}

interface SetupRequest {
  controller: AbortController;
  tournamentId: string;
  mode: QualificationMode;
}

/**
 * Owns BM/MR/GP qualification setup communication without owning dialog state.
 * Failed submissions keep the caller's form state intact so the administrator
 * can review the current tournament state and retry explicitly.
 */
export function useQualificationSetup({ tournamentId, mode, refetch }: UseQualificationSetupOptions) {
  const tc = useTranslations('common');
  const logger = useMemo(() => createLogger({ serviceName: `tournaments-${mode}` }), [mode]);
  const savingRef = useRef(false);
  const requestRef = useRef<SetupRequest | null>(null);
  const identityRef = useRef({ tournamentId, mode });
  identityRef.current = { tournamentId, mode };
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState<QualificationSetupError | null>(null);

  const clearSetupError = useCallback(() => setSetupError(null), []);

  useEffect(() => {
    // Setup POSTs are non-idempotent and belong to the identity that started
    // them. A new tournament/mode must not inherit the old request lock or UI
    // state, and the old request should be cancelled whenever possible.
    const previousRequest = requestRef.current;
    if (previousRequest && (previousRequest.tournamentId !== tournamentId || previousRequest.mode !== mode)) {
      previousRequest.controller.abort();
      requestRef.current = null;
    }
    savingRef.current = false;
    setSetupSaving(false);
    setSetupError(null);

    return () => {
      const activeRequest = requestRef.current;
      if (activeRequest?.tournamentId === tournamentId && activeRequest.mode === mode) {
        activeRequest.controller.abort();
        requestRef.current = null;
        savingRef.current = false;
      }
    };
  }, [mode, tournamentId]);

  const submitSetup = useCallback(
    async (players: readonly SetupPlayer[]): Promise<SubmitSetupResult> => {
      const existingRequest = requestRef.current;
      const existingRequestIsCurrent = existingRequest?.tournamentId === tournamentId && existingRequest.mode === mode;
      if (savingRef.current && existingRequestIsCurrent) {
        const error: QualificationSetupError = {
          kind: 'validation',
          message: tc('operationInProgress'),
        };
        setSetupError(error);
        return { ok: false, error };
      }

      if (players.length === 0) {
        const error: QualificationSetupError = {
          kind: 'validation',
          message: tc('selectAtLeastOnePlayer'),
        };
        setSetupError(error);
        return { ok: false, error };
      }

      // If a new identity can submit before the previous effect cleanup runs,
      // explicitly retire the stale request here as well.
      if (existingRequest && !existingRequestIsCurrent) {
        existingRequest.controller.abort();
        requestRef.current = null;
        savingRef.current = false;
      }

      // Snapshot the payload before awaiting so UI edits can never change the
      // body of an in-flight non-idempotent request.
      const snapshot = players.map((player) => ({ ...player }));
      const controller = new AbortController();
      const request: SetupRequest = { controller, tournamentId, mode };
      requestRef.current = request;
      savingRef.current = true;
      setSetupSaving(true);
      setSetupError(null);

      const isCurrentRequest = () =>
        !controller.signal.aborted &&
        requestRef.current === request &&
        identityRef.current.tournamentId === tournamentId &&
        identityRef.current.mode === mode;

      try {
        let response: Response;
        try {
          response = await fetch(`/api/tournaments/${tournamentId}/${mode}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ players: snapshot }),
            signal: controller.signal,
          });
        } catch (cause) {
          if (!isCurrentRequest()) return { ok: false };
          const error: QualificationSetupError = {
            kind: 'network',
            message: tc('networkError'),
          };
          setSetupError(error);
          logger.error('Qualification setup request failed', {
            tournamentId,
            mode,
            error: cause,
          });
          return { ok: false, error };
        }

        if (!isCurrentRequest()) return { ok: false };

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as SetupErrorPayload | null;
          if (!isCurrentRequest()) return { ok: false };
          const isValidation = response.status < 500;
          const code = typeof payload?.code === 'string' ? payload.code : undefined;
          const error: QualificationSetupError = {
            kind: isValidation ? 'validation' : 'server',
            status: response.status,
            code,
            message: tc(isValidation ? 'setupValidationError' : 'setupServerError'),
          };
          setSetupError(error);
          logger.warn('Qualification setup rejected', {
            tournamentId,
            mode,
            status: response.status,
            code,
          });
          return { ok: false, error };
        }

        setSetupError(null);

        // The POST has already succeeded. A refresh failure must not be exposed
        // as a setup failure, because retrying the non-idempotent POST could
        // regenerate records that the server already created.
        try {
          await refetch();
        } catch (cause) {
          if (!isCurrentRequest()) return { ok: false };
          logger.warn('Qualification setup refresh failed after successful submit', {
            tournamentId,
            mode,
            error: cause,
          });
        }

        if (!isCurrentRequest()) return { ok: false };
        return { ok: true };
      } finally {
        if (isCurrentRequest()) {
          requestRef.current = null;
          savingRef.current = false;
          setSetupSaving(false);
        }
      }
    },
    [logger, mode, refetch, tc, tournamentId],
  );

  return {
    submitSetup,
    setupSaving,
    setupError,
    clearSetupError,
  };
}
