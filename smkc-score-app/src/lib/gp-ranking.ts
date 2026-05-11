type SortDirection = 'asc' | 'desc';
type OrderByClause = Record<string, SortDirection>;

export interface GpRankableEntry {
  score: number;
  points: number;
}

const GP_QUALIFICATION_ORDER_BY = [
  { group: 'asc' },
  { score: 'desc' },
  { points: 'desc' },
] as const satisfies readonly OrderByClause[];

const GP_STANDINGS_ORDER_BY = [
  { score: 'desc' },
  { points: 'desc' },
] as const satisfies readonly OrderByClause[];

export function gpQualificationOrderBy(): OrderByClause[] {
  return GP_QUALIFICATION_ORDER_BY.map((clause) => ({ ...clause }));
}

export function gpStandingsOrderBy(): OrderByClause[] {
  return GP_STANDINGS_ORDER_BY.map((clause) => ({ ...clause }));
}

export function compareGpQualificationEntries<T extends GpRankableEntry>(a: T, b: T): number {
  return b.score - a.score || b.points - a.points;
}
