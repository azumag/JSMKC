/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { TASuddenDeathSection } from '@/components/tournament/ta-sudden-death-panel';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(':')}` : key,
  useLocale: () => 'en',
}));

const pendingSuddenDeath = {
  id: 'sd-1',
  sequence: 1,
  course: 'GV1',
  targetPlayerIds: ['player-1'],
  resolved: false,
  round: {
    id: 'round-1',
    roundNumber: 3,
    suddenDeathRounds: [],
  },
};

const entry = {
  id: 'entry-1',
  playerId: 'player-1',
  player: { nickname: 'Mario' },
};

function renderSection(saveError: string | null) {
  return render(
    <TASuddenDeathSection
      isAdmin
      isComplete={false}
      pendingSuddenDeath={pendingSuddenDeath}
      pendingSuddenDeathEntries={[entry]}
      availableCourses={['MC1']}
      saveError={saveError}
      suddenDeathTimes={{ 'player-1': '1:00.00' }}
      changingSuddenDeathCourse={false}
      submittingSuddenDeath={false}
      timeInputProps={{}}
      timeInputHelp="Enter M:SS.mm format."
      timePlaceholder="1:23.45"
      submittingLabel="Saving..."
      onCourseChange={jest.fn()}
      onTimeChange={jest.fn()}
      onTimeBlur={jest.fn()}
      onSubmit={jest.fn()}
    />,
  );
}

describe('TASuddenDeathPanel accessibility', () => {
  it('announces save errors through an alert role', () => {
    renderSection('API error');

    expect(screen.getByRole('alert')).toHaveTextContent('API error');
  });

  it('does not expose an empty alert when there is no save error', () => {
    renderSection(null);

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
