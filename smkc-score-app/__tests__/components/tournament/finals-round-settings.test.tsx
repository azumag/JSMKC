/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { FinalsRoundSettings } from '@/components/tournament/finals-round-settings';

describe('FinalsRoundSettings', () => {
  it('uses the pending round format when opened from a completed historic FT card', () => {
    render(
      <FinalsRoundSettings
        match={{ id: 'completed', stage: 'finals', round: 'winners_r1', completed: true, version: 4, targetWins: 5 }}
        matches={[
          { id: 'completed', stage: 'finals', round: 'winners_r1', completed: true, version: 4, targetWins: 5 },
          { id: 'pending', stage: 'finals', round: 'winners_r1', completed: false, version: 2, targetWins: 7 },
        ]}
        endpoint="/api/test"
        effectiveTargetWins={5}
        onSaved={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Round target wins')).toHaveValue(7);
  });
});
