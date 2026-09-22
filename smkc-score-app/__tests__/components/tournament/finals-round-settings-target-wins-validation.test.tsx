/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { FinalsRoundSettings } from '@/components/tournament/finals-round-settings';
import enMessages from '../../../messages/en.json';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: keyof typeof enMessages.finals) => enMessages.finals[key],
}));

describe('FinalsRoundSettings persisted targetWins validation', () => {
  it('ignores an invalid pending value and uses the next valid round format', () => {
    render(
      <FinalsRoundSettings
        match={{ id: 'completed', stage: 'finals', round: 'winners_r1', completed: true, version: 4, targetWins: 5 }}
        matches={[
          { id: 'completed', stage: 'finals', round: 'winners_r1', completed: true, version: 4, targetWins: 5 },
          { id: 'invalid', stage: 'finals', round: 'winners_r1', completed: false, version: 2, targetWins: 100 },
          { id: 'valid', stage: 'finals', round: 'winners_r1', completed: false, version: 3, targetWins: 7 },
        ]}
        endpoint="/api/test"
        effectiveTargetWins={5}
        onSaved={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Round format')).toHaveValue(7);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([100, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    'falls back to the effective format when the only pending value is invalid (%p)',
    (invalidTargetWins) => {
      render(
        <FinalsRoundSettings
          match={{ id: 'pending', stage: 'finals', round: 'winners_r1', completed: false, version: 2, targetWins: invalidTargetWins }}
          matches={[
            {
              id: 'pending',
              stage: 'finals',
              round: 'winners_r1',
              completed: false,
              version: 2,
              targetWins: invalidTargetWins,
            },
          ]}
          endpoint="/api/test"
          effectiveTargetWins={5}
          onSaved={jest.fn()}
        />,
      );

      expect(screen.getByLabelText('Round format')).toHaveValue(5);
    },
  );

  it('preserves the maximum valid persisted value', () => {
    render(
      <FinalsRoundSettings
        match={{ id: 'pending', stage: 'finals', round: 'winners_r1', completed: false, version: 2, targetWins: 99 }}
        matches={[{ id: 'pending', stage: 'finals', round: 'winners_r1', completed: false, version: 2, targetWins: 99 }]}
        endpoint="/api/test"
        effectiveTargetWins={5}
        onSaved={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Round format')).toHaveValue(99);
  });
});
