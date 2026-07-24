export type CdmArchiveReconciliationIdentity = {
  id?: string | null;
  name: string;
  slug?: string | null;
  cdmArchiveReconciliationExcluded?: boolean;
};

function configuredExcludedTournamentIds(): Set<string> {
  return new Set(
    (process.env.CDM_ARCHIVE_RECONCILIATION_EXCLUDED_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

/** Match all common JSMKC spellings, including compact forms such as JSMKC2025. */
export function hasJsmkcIdentity(tournament: Pick<CdmArchiveReconciliationIdentity, 'name' | 'slug'>): boolean {
  return /jsmkc/i.test(`${tournament.name} ${tournament.slug ?? ''}`);
}

/**
 * Server-side safety gate for the archive reconciliation workflow.
 *
 * The persisted flag is sticky and is backfilled for existing JSMKC records.
 * The optional ID denylist is a second stable guard for production records.
 * Name/slug matching remains defense-in-depth for legacy or newly imported rows.
 */
export function isCdmArchiveReconciliationExcluded(tournament: CdmArchiveReconciliationIdentity): boolean {
  if (tournament.cdmArchiveReconciliationExcluded === true) return true;
  if (tournament.id && configuredExcludedTournamentIds().has(tournament.id)) return true;
  return hasJsmkcIdentity(tournament);
}
