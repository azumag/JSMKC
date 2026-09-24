import { hasJsmkcIdentity, isCdmArchiveReconciliationExcluded } from '@/lib/cdm-archive-reconciliation-policy';

const EXCLUDED_IDS_ENV = 'CDM_ARCHIVE_RECONCILIATION_EXCLUDED_IDS';
const originalExcludedIds = process.env[EXCLUDED_IDS_ENV];

beforeEach(() => {
  delete process.env[EXCLUDED_IDS_ENV];
});

afterEach(() => {
  if (originalExcludedIds === undefined) {
    delete process.env[EXCLUDED_IDS_ENV];
  } else {
    process.env[EXCLUDED_IDS_ENV] = originalExcludedIds;
  }
});

describe('hasJsmkcIdentity', () => {
  it.each([
    [{ name: 'JSMKC 2025', slug: null }, true],
    [{ name: 'Spring Cup', slug: 'jsmkc2026' }, true],
    [{ name: 'jsMkC Invitational', slug: 'spring-cup' }, true],
    [{ name: 'Spring Cup', slug: 'spring-cup' }, false],
  ])('classifies %j as %s', (tournament, expected) => {
    expect(hasJsmkcIdentity(tournament)).toBe(expected);
  });
});

describe('isCdmArchiveReconciliationExcluded', () => {
  it('keeps the persisted exclusion flag sticky', () => {
    expect(
      isCdmArchiveReconciliationExcluded({
        id: 'ordinary-tournament',
        name: 'Spring Cup',
        slug: 'spring-cup',
        cdmArchiveReconciliationExcluded: true,
      }),
    ).toBe(true);
  });

  it('matches a trimmed tournament id from the configured denylist', () => {
    process.env[EXCLUDED_IDS_ENV] = 'other-id, protected-id ,another-id';

    expect(
      isCdmArchiveReconciliationExcluded({
        id: 'protected-id',
        name: 'Spring Cup',
        slug: 'spring-cup',
      }),
    ).toBe(true);
  });

  it('does not exclude an unrelated tournament when no guard matches', () => {
    expect(
      isCdmArchiveReconciliationExcluded({
        id: 'ordinary-tournament',
        name: 'Spring Cup',
        slug: 'spring-cup',
      }),
    ).toBe(false);
  });
});
