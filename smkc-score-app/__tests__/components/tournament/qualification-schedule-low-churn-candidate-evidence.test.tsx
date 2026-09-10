/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { QualificationScheduleDiagnosticsPanel } from '@/components/tournament/qualification-schedule-diagnostics-panel';

describe('QualificationScheduleDiagnosticsPanel low-churn CDM candidate evidence', () => {
  it('shows the fairness-equivalent low-churn 13-player alternative and remaining blockers', () => {
    render(<QualificationScheduleDiagnosticsPanel configuredMethod="cdm" diagnostics={{ bm: [], mr: [], gp: [] }} />);

    const evidence = screen.getByLabelText('Unsupported CDM fixture candidate decisions');
    expect(evidence).toHaveTextContent('Fairness representative BREAK slots: 1, 5, 9');
    expect(evidence).toHaveTextContent('Lowest-churn fair BREAK slots: 8, 12, 16');
    expect(evidence).toHaveTextContent(
      'Fairness representative churn: 72/78 Day changes · total shift 314 days · 34 side flips · 13/13 seeds remapped',
    );
    expect(evidence).toHaveTextContent(
      'Lowest-churn fair impact: 56/78 Day changes · total shift 218 days · 27 side flips · 6/13 seeds remapped · max slot shift +2',
    );
    expect(evidence).toHaveTextContent('Lowest-churn seed remap (6)');
    expect(evidence).toHaveTextContent(
      'S8→9 (+1) · S9→10 (+1) · S10→11 (+1) · S11→13 (+2) · S12→14 (+2) · S13→15 (+2)',
    );
    expect(evidence).toHaveTextContent(
      'Blocking decisions: break-slot-placement, day-order-fidelity, side-orientation-fidelity',
    );
  });
});
