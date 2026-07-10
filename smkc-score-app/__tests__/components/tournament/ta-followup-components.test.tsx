/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaHandicapBadge } from '@/components/tournament/ta-handicap-badge';
import { TaLivesIndicator } from '@/components/tournament/ta-lives-indicator';
import { TaModeBadge } from '@/components/tournament/ta-mode-badge';
import { TaModeSelector } from '@/components/tournament/ta-mode-selector';

jest.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('TA follow-up components', () => {
  it('normalizes handicap badge text', () => {
    render(<TaHandicapBadge value={-3} />);
    expect(screen.getByText('-3秒')).toBeInTheDocument();
  });

  it('renders compact lives and an explicit eliminated state', () => {
    const { rerender } = render(
      <TaLivesIndicator
        lives={10}
        maxLives={10}
        eliminated={false}
        eliminatedLabel="eliminated"
        ariaLabel="10 lives"
      />,
    );
    expect(screen.getByLabelText('10 lives')).toHaveTextContent('♥ 10/10');
    rerender(<TaLivesIndicator lives={0} maxLives={10} eliminated eliminatedLabel="eliminated" />);
    expect(screen.getByText('eliminated')).toBeInTheDocument();
  });

  it('uses localized mode labels and compact labels', () => {
    const { rerender } = render(<TaModeBadge mode="standard" />);
    expect(screen.getByText('standardTaModeTitle')).toBeInTheDocument();
    rerender(<TaModeBadge mode="battle_royale" verbose={false} />);
    expect(screen.getByText('battleRoyaleModeShort')).toBeInTheDocument();
  });

  it('changes mode by keyboard-accessible radio controls', async () => {
    const user = userEvent.setup();
    const onValueChange = jest.fn();
    render(<TaModeSelector value="standard" onValueChange={onValueChange} />);
    const battle = screen.getByRole('radio', { name: /battleRoyaleModeTitle/ });
    await user.click(battle);
    expect(onValueChange).toHaveBeenCalledWith('battle_royale');
  });
});
