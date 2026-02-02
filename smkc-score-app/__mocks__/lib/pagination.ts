// Create mock functions for pagination module
export function getPaginationParams(options = {}) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Number(options.limit);
  const finalLimit = limit && limit > 0 ? Math.min(100, limit) : 50;
  
  return {
    page,
    limit: finalLimit,
    skip: (page - 1) * finalLimit,
  };
}

export const paginate = jest.fn();
