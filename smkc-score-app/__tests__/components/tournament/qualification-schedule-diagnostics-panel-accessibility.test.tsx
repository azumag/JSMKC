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
  it('uses headings to name each diagnostic group', () => {
    render(<QualificationScheduleDiagnosticsPanel configuredMethod="cdm" diagnostics={diagnostics} />);

    expect(screen.getByRole('group', { name: 'Qualification schedule decision summary' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Policy matrix (7–21 players)' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Unsupported CDM candidate evidence' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Circle → CDM impact (7–12 players)' })).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Qualification schedule decision summary', level: 3 })).toHaveClass(
      'sr-only',
    );
  });
});
