import type {
  Tc939TabNavigationReporter,
} from '../../e2e/lib/tc939-reporting';

type Tc939ReportingModule = typeof import('../../e2e/lib/tc939-reporting');

describe('describeTc939TabNavigation', () => {
  let describeTc939TabNavigation: Tc939TabNavigationReporter;

  beforeAll(async () => {
    ({ describeTc939TabNavigation } = (await import('../../e2e/lib/tc939-reporting.js')) as Tc939ReportingModule);
  });

  it('passes with no detail when SPA state and hydrated classes are both valid', () => {
    expect(describeTc939TabNavigation({
      spaMarker: 'alive',
      cleanClasses: true,
    })).toEqual({
      status: 'PASS',
      detail: '',
    });
  });

  it('reports both independent TC-939 failure reasons', () => {
    expect(describeTc939TabNavigation({
      spaMarker: 'lost',
      cleanClasses: false,
    })).toEqual({
      status: 'FAIL',
      detail: 'Tab click caused a full document reload / Hydrated tab className contains extra whitespace',
    });
  });

  it('reports null SPA markers as full reload failures with className detail', () => {
    expect(describeTc939TabNavigation({
      spaMarker: null,
      cleanClasses: false,
    })).toEqual({
      status: 'FAIL',
      detail: 'Tab click caused a full document reload / Hydrated tab className contains extra whitespace',
    });
  });

  it('reports reload-only failure without className issues', () => {
    expect(describeTc939TabNavigation({
      spaMarker: 'reload-only',
      cleanClasses: true,
    })).toEqual({
      status: 'FAIL',
      detail: 'Tab click caused a full document reload',
    });
  });

  it('reports a className-only failure without a reload message', () => {
    expect(describeTc939TabNavigation({
      spaMarker: 'alive',
      cleanClasses: false,
    })).toEqual({
      status: 'FAIL',
      detail: 'Hydrated tab className contains extra whitespace',
    });
  });

  it('uses the shared TC-939 reporter declaration without local input/result casts', () => {
    const pass = describeTc939TabNavigation({
      spaMarker: 'alive',
      cleanClasses: true,
    });

    expect(pass.status).toBe('PASS');
    expect(pass.detail).toBe('');
  });
});
