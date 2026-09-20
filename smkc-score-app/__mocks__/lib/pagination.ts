// Create mock functions for pagination module
export function getPaginationParams(
  options: {
    page?: number | string;
    limit?: number | string;
    include?: Record<string, unknown>;
  } = {},
) {
  const parsedPage = Number(options.page ?? 1);
  const parsedLimit = Number(options.limit ?? 50);

  const normalizedPage = Number.isFinite(parsedPage) ? Math.max(1, Math.floor(parsedPage)) : 1;
  const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, Math.floor(parsedLimit))) : 50;
  const rawSkip = (normalizedPage - 1) * limit;
  const hasSafeSkip = Number.isSafeInteger(rawSkip) && rawSkip >= 0;
  const page = hasSafeSkip ? normalizedPage : 1;

  return {
    page,
    limit,
    skip: hasSafeSkip ? rawSkip : 0,
    include: options.include,
  };
}

export const paginate = jest.fn();
