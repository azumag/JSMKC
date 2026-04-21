/**
 * Shared helper for mocking `NextResponse.json` in API route tests.
 *
 * Background: the route handlers now route responses through
 * `createSuccessResponse` / `createErrorResponse` in `@/lib/error-handling`,
 * which wrap payloads as `{ success, data: {...} }` or `{ success: false,
 * error, code }`. Legacy tests wrote assertions against the unwrapped shape
 * (`result.data.tournamentId` where `result.data` was the raw body). They
 * also set response headers via `response.headers.set(...)` which requires
 * a real setter rather than a plain object.
 *
 * `configureNextResponseMock(NextResponse)` installs a jest mockImplementation
 * that:
 *   • unwraps `createSuccessResponse` bodies so `result.data.X` keeps working
 *     when X was inside the `data` payload (error bodies pass through so
 *     `result.data.error` / `.code` remain available);
 *   • exposes a real, mutable `headers` object with non-enumerable `set`/`get`
 *     methods so the factory's ETag + Cache-Control writes don't throw and
 *     `toEqual({ ETag: '...' })` still matches after those writes.
 *
 * Usage:
 *
 *     jest.mock('next/server', () => ({ NextResponse: { json: jest.fn() } }));
 *
 *     beforeEach(() => {
 *       configureNextResponseMock(jest.requireMock('next/server').NextResponse);
 *     });
 *
 * This keeps each test file's existing `result.data.X` assertions valid
 * without a sweeping rewrite across the suite.
 */

export interface NextResponseMockOptions {
  /**
   * When true (default), responses produced by `createSuccessResponse`
   * — shape `{ success: true, data: {...} }` — are unwrapped so that
   * legacy assertions like `result.data.tournamentId` keep working.
   *
   * Set to false for test files that have already been migrated to
   * expect the wrapped envelope directly (e.g. `result.data.toEqual({
   * success: true, data: {...} })`). Error responses always pass through
   * unchanged regardless of this flag — they ship `{ success: false,
   * error, code }` which existing tests read as `result.data.error` etc.
   */
  unwrap?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function configureNextResponseMock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  NextResponse: any,
  options: NextResponseMockOptions = {},
): void {
  if (!NextResponse?.json?.mockImplementation) {
    throw new Error('configureNextResponseMock expects a jest-mocked NextResponse.json');
  }

  const unwrap = options.unwrap ?? true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  NextResponse.json.mockImplementation((body: any, responseOptions?: any) => {
    const data =
      unwrap &&
      body &&
      typeof body === 'object' &&
      body.success === true &&
      'data' in body
        ? body.data
        : body;

    const headers: Record<string, string> = { ...(responseOptions?.headers ?? {}) };
    Object.defineProperty(headers, 'set', {
      enumerable: false,
      value: (k: string, v: string) => {
        headers[k] = v;
      },
    });
    Object.defineProperty(headers, 'get', {
      enumerable: false,
      value: (k: string) => headers[k],
    });

    return {
      data,
      status: responseOptions?.status ?? 200,
      headers,
    };
  });
}
