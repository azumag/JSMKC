describe('TC-939 E2E reporting contract', () => {
  it('keeps dual tab navigation failures visible in one log detail', async () => {
    const { describeTc939TabNavigation } = await import('../../e2e/lib/tc939-reporting.js') as {
      describeTc939TabNavigation: (input: {
        spaMarker: unknown;
        cleanClasses: boolean;
      }) => { status: 'PASS' | 'FAIL'; detail: string };
    };

    const result = describeTc939TabNavigation({
      spaMarker: null,
      cleanClasses: false,
    });

    expect(result.status).toBe('FAIL');
    expect(result.detail).toContain('Tab click caused a full document reload');
    expect(result.detail).toContain('Hydrated tab className contains extra whitespace');
  });
});
