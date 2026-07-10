import { useCallback, useMemo, useRef, useState } from 'react';
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
  error?: unknown;
  code?: unknown;
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
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState<QualificationSetupError | null>(null);

  const clearSetupError = useCallback(() => setSetupError(null), []);

  const submitSetup = useCallback(
    async (players: readonly SetupPlayer[]): Promise<SubmitSetupResult> => {
      if (savingRef.current) {
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

      // Snapshot the payload before awaiting so UI edits can never change the
      // body of an in-flight non-idempotent request.
      const snapshot = players.map((player) => ({ ...player }));
      savingRef.current = true;
      setSetupSaving(true);
      setSetupError(null);

      try {
        let response: Response;
        try {
          response = await fetch(`/api/tournaments/${tournamentId}/${mode}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ players: snapshot }),
          });
        } catch (cause) {
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

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as SetupErrorPayload | null;
          const isValidation = response.status < 500;
          const code = typeof payload?.code === 'string' ? payload.code : undefined;
          const serverMessage = typeof payload?.error === 'string' ? payload.error : undefined;
          const error: QualificationSetupError = {
            kind: isValidation ? 'validation' : 'server',
            status: response.status,
            code,
            message:
              isValidation && serverMessage
                ? serverMessage
                : tc(isValidation ? 'setupValidationError' : 'setupServerError'),
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
          logger.warn('Qualification setup refresh failed after successful submit', {
            tournamentId,
            mode,
            error: cause,
          });
        }

        return { ok: true };
      } finally {
        savingRef.current = false;
        setSetupSaving(false);
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
