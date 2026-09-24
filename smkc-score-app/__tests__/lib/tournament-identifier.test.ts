import prisma from '@/lib/prisma';
import {
  getTournamentUrlIdentifier,
  isValidTournamentSlug,
  normalizeTournamentSlug,
  resolveTournament,
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

  it('accepts generic UUID-format tournament identifiers without requiring UUID v4', () => {
    expect(isValidTournamentSlug('123E4567-E89B-12D3-A456-426614174000')).toBe(true);
    expect(isValidTournamentSlug('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
    // Use uppercase malformed examples so they cannot fall through to the
    // separate canonical-slug grammar, which intentionally permits hyphens.
    expect(isValidTournamentSlug('123E4567-E89B-42D3-A456-42661417400')).toBe(false);
    expect(isValidTournamentSlug('123E4567-E89B-42D3-A456-42661417400G')).toBe(false);
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

  it('resolves tournament fields in one query and injects id into the projection', async () => {
    const tournament = { id: 't1', qualificationConfirmed: true };
    const select = { qualificationConfirmed: true };
    (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(tournament);

    await expect(resolveTournament('jsmkc2026', select)).resolves.toEqual(tournament);

    expect(prisma.tournament.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.tournament.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ id: 'jsmkc2026' }, { slug: 'jsmkc2026' }] },
      select: { qualificationConfirmed: true, id: true },
    });
    expect(select).toEqual({ qualificationConfirmed: true });
  });

  it('preserves an explicit id projection when resolving tournament fields', async () => {
    const tournament = { id: 't1', slug: 'jsmkc2026' };
    const select = { id: true, slug: true };
    (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(tournament);

    await expect(resolveTournament('jsmkc2026', select)).resolves.toEqual(tournament);

    expect(prisma.tournament.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.tournament.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ id: 'jsmkc2026' }, { slug: 'jsmkc2026' }] },
      select,
    });
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
