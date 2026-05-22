type Tc939TabNavigationReporter = (input: {
  spaMarker: unknown;
  cleanClasses: boolean;
}) => { status: 'PASS' | 'FAIL'; detail: string };

type Tc939ReportingModule = {
  describeTc939TabNavigation: Tc939TabNavigationReporter;
};

describe('describeTc939TabNavigation', () => {
  let describeTc939TabNavigation: Tc939TabNavigationReporter;

  beforeEach(async () => {
    ({ describeTc939TabNavigation } = (await import('../../e2e/lib/tc939-reporting.js')) as Tc939ReportingModule);
  });

  it('passes with no detail when SPA state and hydrated classes are both valid', async () => {
    expect(describeTc939TabNavigation({
      spaMarker: 'alive',
      cleanClasses: true,
    })).toEqual({
      status: 'PASS',
      detail: '',
    });
  });

  it('reports both independent TC-939 failure reasons', async () => {
    expect(describeTc939TabNavigation({
      spaMarker: 'lost',
      cleanClasses: false,
    })).toEqual({
      status: 'FAIL',
      detail: 'Tab click caused a full document reload / Hydrated tab className contains extra whitespace',
    });
  });

  it('reports reload-only failure without className issues', async () => {
    expect(describeTc939TabNavigation({
      spaMarker: 'reload-only',
      cleanClasses: true,
    })).toEqual({
      status: 'FAIL',
      detail: 'Tab click caused a full document reload',
    });
  });

  it('reports a className-only failure without a reload message', async () => {
    expect(describeTc939TabNavigation({
      spaMarker: 'alive',
      cleanClasses: false,
    })).toEqual({
      status: 'FAIL',
      detail: 'Hydrated tab className contains extra whitespace',
    });
  });
});
