import { classifyPlayerUpdateFailure } from '@/lib/player-mutation-error';
import { PLAYER_ERROR_CODES } from '@/lib/player-error-codes';

describe('classifyPlayerUpdateFailure', () => {
  it('localizes only the known duplicate nickname code on 4xx', async () => {
    const response = new Response(
      JSON.stringify({ code: PLAYER_ERROR_CODES.DUPLICATE_NICKNAME, error: 'internal duplicate detail' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );

    await expect(classifyPlayerUpdateFailure(response)).resolves.toBe('duplicateNickname');
  });

  it('reduces arbitrary 4xx backend prose to a generic failure', async () => {
    const response = new Response(JSON.stringify({ error: 'validation internals that must not reach the UI' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(classifyPlayerUpdateFailure(response)).resolves.toBe('generic');
  });

  it('reduces 5xx JSON failures to a generic failure', async () => {
    const response = new Response(JSON.stringify({ error: 'database stack detail' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(classifyPlayerUpdateFailure(response)).resolves.toBe('generic');
  });

  it('reduces non-JSON failures to a generic failure', async () => {
    const response = new Response('<html>worker failure</html>', {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });

    await expect(classifyPlayerUpdateFailure(response)).resolves.toBe('generic');
  });

  it('does not treat unknown machine-readable codes as user-visible distinctions', async () => {
    const response = new Response(JSON.stringify({ code: 'SENSITIVE_INTERNAL_STATE', error: 'raw detail' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(classifyPlayerUpdateFailure(response)).resolves.toBe('generic');
  });
});
