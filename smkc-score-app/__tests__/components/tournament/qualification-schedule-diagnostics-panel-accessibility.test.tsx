/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { QualificationScheduleDiagnosticsPanel } from '@/components/tournament/qualification-schedule-diagnostics-panel';
import type { QualificationScheduleDiagnostics } from '@/lib/qualification-schedule-diagnostics';

const diagnostics: QualificationScheduleDiagnostics = {
  bm: [
    {
      group: 'A',
      configuredMethod: 'cdm',
      playerCount: 14,
      effectiveMethod: 'cdm',
      reason: 'cdm-requested',
      generationSupported: true,
      cdmFixtureCapacity: 16,
      cdmBreakSlotCount: 2,
    },
  ],
  mr: [],
  gp: [],
};

describe('QualificationScheduleDiagnosticsPanel accessibility', () => {
  it('exposes each labelled diagnostic region as a named group', () => {
    render(<QualificationScheduleDiagnosticsPanel configuredMethod="cdm" diagnostics={diagnostics} />);

    expect(screen.getByRole('group', { name: 'Qualification schedule decision summary' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Qualification schedule policy matrix' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Unsupported CDM fixture candidate decisions' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Circle versus CDM schedule comparison' })).toBeInTheDocument();
  });
});
