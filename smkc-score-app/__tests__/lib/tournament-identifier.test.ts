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

  it('returns slug when building tournament URL identifier', () => {
    expect(getTournamentUrlIdentifier({ id: 't1', slug: 'jsmkc2026' })).toBe('jsmkc2026');
    expect(getTournamentUrlIdentifier({ id: 't1', slug: null })).toBe('t1');
  });

  it('resolves tournament id from slug when found', async () => {
    (prisma.tournament.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });

    await expect(resolveTournamentId('jsmkc2026')).resolves.toBe('t1');
  });

  it('falls back to the original identifier when no tournament is found', async () => {
    (prisma.tournament.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(resolveTournamentId('t1')).resolves.toBe('t1');
  });
});
