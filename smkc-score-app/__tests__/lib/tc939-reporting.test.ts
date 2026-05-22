describe('describeTc939TabNavigation', () => {
  it('passes with no detail when SPA state and hydrated classes are both valid', async () => {
    const { describeTc939TabNavigation } = await import('../../e2e/lib/tc939-reporting.js') as {
      describeTc939TabNavigation: (input: {
        spaMarker: unknown;
        cleanClasses: boolean;
      }) => { status: 'PASS' | 'FAIL'; detail: string };
    };

    expect(describeTc939TabNavigation({
      spaMarker: 'alive',
      cleanClasses: true,
    })).toEqual({
      status: 'PASS',
      detail: '',
    });
  });

  it('reports both independent TC-939 failure reasons', async () => {
    const { describeTc939TabNavigation } = await import('../../e2e/lib/tc939-reporting.js') as {
      describeTc939TabNavigation: (input: {
        spaMarker: unknown;
        cleanClasses: boolean;
      }) => { status: 'PASS' | 'FAIL'; detail: string };
    };

    expect(describeTc939TabNavigation({
      spaMarker: 'lost',
      cleanClasses: false,
    })).toEqual({
      status: 'FAIL',
      detail: 'Tab click caused a full document reload / Hydrated tab className contains extra whitespace',
    });
  });

  it('reports reload-only failure without className issues', async () => {
    const { describeTc939TabNavigation } = await import('../../e2e/lib/tc939-reporting.js') as {
      describeTc939TabNavigation: (input: {
        spaMarker: unknown;
        cleanClasses: boolean;
      }) => { status: 'PASS' | 'FAIL'; detail: string };
    };

    expect(describeTc939TabNavigation({
      spaMarker: 'reload-only',
      cleanClasses: true,
    })).toEqual({
      status: 'FAIL',
      detail: 'Tab click caused a full document reload',
    });
  });

  it('reports a className-only failure without a reload message', async () => {
    const { describeTc939TabNavigation } = await import('../../e2e/lib/tc939-reporting.js') as {
      describeTc939TabNavigation: (input: {
        spaMarker: unknown;
        cleanClasses: boolean;
      }) => { status: 'PASS' | 'FAIL'; detail: string };
    };

    expect(describeTc939TabNavigation({
      spaMarker: 'alive',
      cleanClasses: false,
    })).toEqual({
      status: 'FAIL',
      detail: 'Hydrated tab className contains extra whitespace',
    });
  });
});
