/**
 * @jest-environment node
 */

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/error-handling', () => ({
  handleAuthzError: jest.fn(() => ({ status: 403 } as any)),
}));

import { requireAdminSession, requireAdminOrPlayerSession } from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import { handleAuthzError } from '@/lib/error-handling';

const mockAuth = auth as jest.Mock;
const mockHandleAuthzError = handleAuthzError as jest.Mock;

describe('api-auth', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('requireAdminSession', () => {
    it('returns error for unauthenticated (null session)', async () => {
      mockAuth.mockResolvedValue(null);
      const result = await requireAdminSession();
      expect(result.error).toBeDefined();
      expect(mockHandleAuthzError).toHaveBeenCalled();
      expect(result.session).toBeUndefined();
    });

    it('returns error when session has no user', async () => {
      mockAuth.mockResolvedValue({});
      const result = await requireAdminSession();
      expect(result.error).toBeDefined();
    });

    it('returns error for player session (role !== admin)', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'p1', role: 'player', userType: 'player' } });
      const result = await requireAdminSession();
      expect(result.error).toBeDefined();
    });

    it('returns session for admin', async () => {
      const session = { user: { id: 'admin-1', role: 'admin' } };
      mockAuth.mockResolvedValue(session);
      const result = await requireAdminSession();
      expect(result.error).toBeUndefined();
      expect(result.session).toBe(session);
      expect(mockHandleAuthzError).not.toHaveBeenCalled();
    });
  });

  describe('requireAdminOrPlayerSession', () => {
    it('returns error for unauthenticated (null session)', async () => {
      mockAuth.mockResolvedValue(null);
      const result = await requireAdminOrPlayerSession();
      expect(result.error).toBeDefined();
      expect(mockHandleAuthzError).toHaveBeenCalled();
    });

    it('returns session for admin role', async () => {
      const session = { user: { id: 'admin-1', role: 'admin' } };
      mockAuth.mockResolvedValue(session);
      const result = await requireAdminOrPlayerSession();
      expect(result.error).toBeUndefined();
      expect(result.session).toBe(session);
    });

    it('returns session for player userType', async () => {
      const session = { user: { id: 'player-1', userType: 'player' } };
      mockAuth.mockResolvedValue(session);
      const result = await requireAdminOrPlayerSession();
      expect(result.error).toBeUndefined();
      expect(result.session).toBe(session);
    });

    it('returns error for authenticated user with neither admin role nor player userType', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'other-1', role: 'guest' } });
      const result = await requireAdminOrPlayerSession();
      expect(result.error).toBeDefined();
    });
  });
});
