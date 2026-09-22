import prisma from '@/lib/prisma';
import {
  getTournamentUrlIdentifier,
  isValidTournamentSlug,
  normalizeTournamentSlug,
  resolveTournamentId,
} from '@/lib/tournament-identifier';

describe('tournament-identifier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes slug input', () => {
    expect(normalizeTournamentSlug(' JSMKC2026 ')).toBe('jsmkc2026');
    expect(normalizeTournamentSlug('')).toBeNull();
    expect(normalizeTournamentSlug(undefined)).toBeUndefined();
  });

  it('validates allowed slug format', () => {
    expect(isValidTournamentSlug('jsmkc2026')).toBe(true);
    expect(isValidTournamentSlug('jsmkc-2026')).toBe(true);
    expect(isValidTournamentSlug('JSMKC2026')).toBe(false);
    expect(isValidTournamentSlug('jsmkc 2026')).toBe(false);
  });

  it('uses only valid persisted slugs when building tournament URL identifiers', () => {
    expect(getTournamentUrlIdentifier({ id: 't1', slug: 'jsmkc2026' })).toBe('jsmkc2026');
    expect(getTournamentUrlIdentifier({ id: 't1', slug: '123E4567-E89B-12D3-A456-426614174000' })).toBe(
      '123E4567-E89B-12D3-A456-426614174000',
    );
    expect(getTournamentUrlIdentifier({ id: 't1', slug: null })).toBe('t1');
    expect(getTournamentUrlIdentifier({ id: 't1', slug: '' })).toBe('t1');
    expect(getTournamentUrlIdentifier({ id: 't1', slug: '   ' })).toBe('t1');
    expect(getTournamentUrlIdentifier({ id: 't1', slug: 'JSMKC2026' })).toBe('t1');
    expect(getTournamentUrlIdentifier({ id: 't1', slug: 'jsmkc 2026' })).toBe('t1');
  });

  it('resolves tournament id from slug when found', async () => {
    (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });

    await expect(resolveTournamentId('jsmkc2026')).resolves.toBe('t1');
  });

  it('falls back to the original valid identifier when no tournament is found', async () => {
    (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(resolveTournamentId('t1')).resolves.toBe('t1');
    await expect(resolveTournamentId('123E4567-E89B-12D3-A456-426614174000')).resolves.toBe(
      '123E4567-E89B-12D3-A456-426614174000',
    );
  });

  it.each(['', '   ', 'JSMKC2026', 'jsmkc 2026'])('rejects unresolved malformed identifier %p', async (identifier) => {
    (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(resolveTournamentId(identifier)).rejects.toThrow('Invalid tournament identifier');
  });

  it('keeps validated fallback behavior when the database lookup fails', async () => {
    (prisma.tournament.findFirst as jest.Mock).mockRejectedValue(new Error('database unavailable'));

    await expect(resolveTournamentId('jsmkc2026')).resolves.toBe('jsmkc2026');
    await expect(resolveTournamentId('JSMKC2026')).rejects.toThrow('Invalid tournament identifier');
  });
});
