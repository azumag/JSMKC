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
      generationSupported: true,
      cdmFixtureCapacity: null,
      cdmBreakSlotCount: null,
    },
    {
      group: 'B',
      configuredMethod: 'cdm',
      playerCount: 14,
      effectiveMethod: 'cdm',
      reason: 'cdm-requested',
      generationSupported: true,
      cdmFixtureCapacity: 16,
      cdmBreakSlotCount: 2,
    },
  ],
  mr: [
    {
      group: 'A',
      configuredMethod: 'circle',
      playerCount: 12,
      effectiveMethod: 'circle',
      reason: 'configured-circle',
      generationSupported: true,
      cdmFixtureCapacity: 12,
      cdmBreakSlotCount: 0,
    },
  ],
  gp: [],
};

describe('QualificationScheduleDiagnosticsPanel', () => {
  it('renders configured and effective methods with policy reasons for populated groups', () => {
    render(<QualificationScheduleDiagnosticsPanel configuredMethod="cdm" diagnostics={diagnostics} />);

    expect(screen.getByRole('heading', { name: 'Effective qualification schedule' })).toBeInTheDocument();
    expect(screen.getAllByText('13 players')).toHaveLength(2);
    expect(screen.getAllByText('14 players')).toHaveLength(2);
    expect(screen.getAllByText('CIRCLE').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('CDM').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Configured: CDM · Effective: CIRCLE')).toBeInTheDocument();
    expect(screen.getByText('Configured: CDM · Effective: CDM')).toBeInTheDocument();
    expect(screen.getByText('Configured: CIRCLE · Effective: CIRCLE')).toBeInTheDocument();
    expect(screen.getByText('CDM fixture preview: unavailable for 13 players')).toBeInTheDocument();
    expect(screen.getByText('CDM fixture preview: 16 slots · 2 BREAK slots')).toBeInTheDocument();
    expect(screen.getByText('CDM fixture preview: 12 slots · 0 BREAK slots')).toBeInTheDocument();
    expect(
      screen.getByText('CDM-first tournament, but groups of 13 or fewer still use circle scheduling.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Current policy requests the CDM fixture for groups of 14 or more.')).toBeInTheDocument();
    expect(screen.getByText('Tournament is explicitly configured for circle scheduling.')).toBeInTheDocument();
  });

  it('summarizes the groups and players relevant to the pending scheduling decisions', () => {
    render(<QualificationScheduleDiagnosticsPanel configuredMethod="cdm" diagnostics={diagnostics} />);

    const summary = screen.getByLabelText('Qualification schedule decision summary');
    expect(summary).toHaveTextContent('Legacy circle: 1');
    expect(summary).toHaveTextContent('Legacy circle players: 13');
    expect(summary).toHaveTextContent('Legacy circle with CDM fixture: 0');
    expect(summary).toHaveTextContent('Legacy circle players with CDM fixture: 0');
    expect(summary).toHaveTextContent('Legacy circle exact-fit CDM: 0');
    expect(summary).toHaveTextContent('Legacy circle CDM with BREAK: 0');
    expect(summary).toHaveTextContent('Legacy circle CDM BREAK slots: 0');
    expect(summary).toHaveTextContent('Legacy circle without CDM fixture: 1');
    expect(summary).toHaveTextContent('Legacy circle players without CDM fixture: 13');
    expect(summary).toHaveTextContent('CDM fixture unavailable: 1');
    expect(summary).toHaveTextContent('BREAK required: 1');
    expect(summary).toHaveTextContent('Generation blocked: 0');
    expect(summary).toHaveTextContent('Legacy circle sizes: 13 players × 1 group (no CDM fixture)');
    expect(summary).toHaveTextContent(
      'Legacy circle modes: BM 1 group / 13 players (0 exact-fit / 0 BREAK / 1 unavailable; 0 CDM-ready players / 13 unavailable players / 0 BREAK slots)',
    );
  });

  it('renders the 7..21 policy matrix independently of current group sizes', () => {
    render(<QualificationScheduleDiagnosticsPanel configuredMethod="cdm" diagnostics={{ bm: [], mr: [], gp: [] }} />);

    const matrix = screen.getByLabelText('Qualification schedule policy matrix');
    expect(matrix).toHaveTextContent('Policy matrix (7–21 players)');
    expect(matrix).toHaveTextContent('7 players');
    expect(matrix).toHaveTextContent('8-slot CDM · 1 BREAK');
    expect(matrix).toHaveTextContent('13 players');
    expect(matrix).toHaveTextContent('CDM fixture unavailable');
    expect(matrix).toHaveTextContent('14 players');
    expect(matrix).toHaveTextContent('16-slot CDM · 2 BREAK');
    expect(matrix).toHaveTextContent('21 players');
    expect(matrix).toHaveTextContent('Generation unsupported');
  });

  it('renders the same-seed circle versus CDM comparison evidence for 7..12 players', () => {
    render(<QualificationScheduleDiagnosticsPanel configuredMethod="cdm" diagnostics={{ bm: [], mr: [], gp: [] }} />);

    const comparison = screen.getByLabelText('Circle versus CDM schedule comparison');
    expect(comparison).toHaveTextContent('Circle → CDM impact (7–12 players)');
    expect(comparison).toHaveTextContent('7 players');
    expect(comparison).toHaveTextContent('8-slot CDM');
    expect(comparison).toHaveTextContent('21 real matches · 1 BREAK');
    expect(comparison).toHaveTextContent('Schedule days: circle 7 → CDM 7');
    expect(comparison).toHaveTextContent('Max 1P/2P imbalance: circle 0 → CDM 4');
    expect(comparison).toHaveTextContent('Players above minimum 1P/2P imbalance: circle 0 → CDM 5');
    expect(comparison).toHaveTextContent('12 players');
    expect(comparison).toHaveTextContent('66 real matches · 0 BREAK');
    expect(comparison).toHaveTextContent('Schedule days: circle 11 → CDM 11');
    expect(comparison).toHaveTextContent('Max 1P/2P imbalance: circle 1 → CDM 5');
    expect(comparison).toHaveTextContent('Players above minimum 1P/2P imbalance: circle 0 → CDM 7');
    expect(comparison).toHaveTextContent('Pair set: identical');
    expect(comparison).toHaveTextContent(/Day changes: \d+ pairs \/ \d+ players/);
    expect(comparison).toHaveTextContent(/Side changes: \d+ pairs \/ \d+ players/);
    expect(comparison).toHaveTextContent('BYE/BREAK assignment changes:');
  });

  it('warns when the effective CDM request has no fixture and cannot generate a schedule', () => {
    const unsupported: QualificationScheduleDiagnostics = {
      bm: [
        {
          group: 'Z',
          configuredMethod: 'cdm',
          playerCount: 21,
          effectiveMethod: 'cdm',
          reason: 'cdm-requested',
          generationSupported: false,
          cdmFixtureCapacity: null,
          cdmBreakSlotCount: null,
        },
      ],
      mr: [],
      gp: [],
    };

    render(<QualificationScheduleDiagnosticsPanel configuredMethod="cdm" diagnostics={unsupported} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Current effective CDM request cannot generate a schedule for 21 players because no matching fixture is available.',
    );
    expect(screen.getByLabelText('Qualification schedule decision summary')).toHaveTextContent('Generation blocked: 1');
  });

  it('shows an empty state for modes without qualification groups', () => {
    render(<QualificationScheduleDiagnosticsPanel configuredMethod="cdm" diagnostics={diagnostics} />);

    expect(screen.getByRole('heading', { name: 'GP' })).toBeInTheDocument();
    expect(screen.getByText('No qualification groups yet.')).toBeInTheDocument();
  });

  it('omits the decision summary when no qualification groups exist yet while retaining the policy matrix', () => {
    const empty: QualificationScheduleDiagnostics = { bm: [], mr: [], gp: [] };

    render(<QualificationScheduleDiagnosticsPanel configuredMethod="cdm" diagnostics={empty} />);

    expect(screen.queryByLabelText('Qualification schedule decision summary')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Qualification schedule policy matrix')).toBeInTheDocument();
  });
});
