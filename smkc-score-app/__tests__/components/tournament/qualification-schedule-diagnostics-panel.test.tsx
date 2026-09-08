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
    render(<QualificationScheduleDiagnosticsPanel diagnostics={diagnostics} />);

    expect(screen.getByRole('heading', { name: 'Effective qualification schedule' })).toBeInTheDocument();
    expect(screen.getByText('13 players')).toBeInTheDocument();
    expect(screen.getByText('14 players')).toBeInTheDocument();
    expect(screen.getAllByText('CIRCLE')).toHaveLength(2);
    expect(screen.getByText('CDM')).toBeInTheDocument();
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
    render(<QualificationScheduleDiagnosticsPanel diagnostics={diagnostics} />);

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

    render(<QualificationScheduleDiagnosticsPanel diagnostics={unsupported} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Current effective CDM request cannot generate a schedule for 21 players because no matching fixture is available.',
    );
    expect(screen.getByLabelText('Qualification schedule decision summary')).toHaveTextContent('Generation blocked: 1');
  });

  it('shows an empty state for modes without qualification groups', () => {
    render(<QualificationScheduleDiagnosticsPanel diagnostics={diagnostics} />);

    expect(screen.getByRole('heading', { name: 'GP' })).toBeInTheDocument();
    expect(screen.getByText('No qualification groups yet.')).toBeInTheDocument();
  });

  it('omits the decision summary when no qualification groups exist yet', () => {
    const empty: QualificationScheduleDiagnostics = { bm: [], mr: [], gp: [] };

    render(<QualificationScheduleDiagnosticsPanel diagnostics={empty} />);

    expect(screen.queryByLabelText('Qualification schedule decision summary')).not.toBeInTheDocument();
  });
});
