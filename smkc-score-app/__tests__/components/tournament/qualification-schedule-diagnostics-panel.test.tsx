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
      playerCount: 13,
      effectiveMethod: 'circle',
      reason: 'cdm-small-group-legacy-circle',
    },
    {
      group: 'B',
      configuredMethod: 'cdm',
      playerCount: 14,
      effectiveMethod: 'cdm',
      reason: 'cdm-requested',
    },
  ],
  mr: [
    {
      group: 'A',
      configuredMethod: 'circle',
      playerCount: 12,
      effectiveMethod: 'circle',
      reason: 'configured-circle',
    },
  ],
  gp: [],
};

describe('QualificationScheduleDiagnosticsPanel', () => {
  it('renders configured and effective methods with policy reasons for populated groups', () => {
    render(<QualificationScheduleDiagnosticsPanel diagnostics={diagnostics} />);

    expect(screen.getByRole('heading', { name: 'Effective qualification schedule' })).toBeInTheDocument();
    expect(screen.getByText('13 players')).toBeInTheDocument();
    expect(screen.getByText('14 players')).toBeInTheDocument();
    expect(screen.getAllByText('CIRCLE')).toHaveLength(2);
    expect(screen.getByText('CDM')).toBeInTheDocument();
    expect(screen.getByText('Configured: CDM · Effective: CIRCLE')).toBeInTheDocument();
    expect(screen.getByText('Configured: CDM · Effective: CDM')).toBeInTheDocument();
    expect(screen.getByText('Configured: CIRCLE · Effective: CIRCLE')).toBeInTheDocument();
    expect(
      screen.getByText('CDM-first tournament, but groups of 13 or fewer still use circle scheduling.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Current policy requests the CDM fixture for groups of 14 or more.')).toBeInTheDocument();
    expect(screen.getByText('Tournament is explicitly configured for circle scheduling.')).toBeInTheDocument();
  });

  it('shows an empty state for modes without qualification groups', () => {
    render(<QualificationScheduleDiagnosticsPanel diagnostics={diagnostics} />);

    expect(screen.getByRole('heading', { name: 'GP' })).toBeInTheDocument();
    expect(screen.getByText('No qualification groups yet.')).toBeInTheDocument();
  });
});
